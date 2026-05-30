import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { GOOGLE_PLACES_API_KEY } from '../../config';

const AuthContext = createContext({});

async function geocodeCity(city) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${GOOGLE_PLACES_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            console.log('User city:', data.city);
            console.log('User coordinates:', data.coordinates);
            setUser({ ...firebaseUser, ...data });
            if (data.city && (!data.coordinates || data.coordinates === undefined)) {
              console.log('Attempting to geocode:', data.city);
              const coords = await geocodeCity(data.city);
              console.log('Geocode result:', JSON.stringify(coords));
              if (coords) {
                await updateDoc(doc(db, 'users', firebaseUser.uid), { coordinates: coords });
                console.log('Coordinates saved:', coords);
                setUser({ ...firebaseUser, ...data, coordinates: coords });
              }
            }
          } else {
            setUser(firebaseUser);
          }
        } catch (error) {
          console.log('Error loading user profile:', error);
          setUser(firebaseUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);