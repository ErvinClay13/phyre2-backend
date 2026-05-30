import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, ActivityIndicator, Alert
} from 'react-native';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const REASONS = [
  'Fake profile',
  'Inappropriate photos',
  'Inappropriate messages',
  'Harassment',
  'Spam',
  'Underage user',
  'Other',
];

export default function ReportModal({
  visible,
  onClose,
  reportedUserId,
  reportedUserName,
  context = 'profile',
  contextId = null,
  contextMessages = [],
}) {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Select a reason', 'Please select a reason for your report.');
      return;
    }
    setSubmitting(true);
    try {
      // Submit the report
      await addDoc(collection(db, 'reports'), {
        reportedUserId,
        reportedUserName: reportedUserName || 'Unknown',
        reportedBy: user.uid,
        reportedByName: user.name || 'Unknown',
        reason: selectedReason,
        details: details.trim(),
        context,
        contextId: contextId || null,
        contextMessages: context === 'chat' ? contextMessages : [],
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Flag the content to prevent auto-deletion
      // Only flag pulse posts and lives — profiles and chats don't auto-delete
      if (context === 'pulse' && contextId) {
        try {
          await updateDoc(doc(db, 'pulse', contextId), {
            flagged: true,
            flaggedAt: serverTimestamp(),
            flagReason: selectedReason,
          });
        } catch (e) {
          console.log('Could not flag pulse post (may already be deleted):', e);
        }
      }

      if (context === 'live' && contextId) {
        try {
          await updateDoc(doc(db, 'lives', contextId), {
            flagged: true,
            flaggedAt: serverTimestamp(),
            flagReason: selectedReason,
          });
        } catch (e) {
          console.log('Could not flag live (may already be deleted):', e);
        }
      }

      Alert.alert(
        'Report Submitted',
        'Thank you for keeping Phyre safe. We will review this report shortly.'
      );
      handleClose();
    } catch (e) {
      console.log('Report error:', e);
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedReason(null);
    setDetails('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Report {reportedUserName || 'User'}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Why are you reporting this {context === 'pulse' ? 'post' : 'user'}?
          </Text>

          <View style={styles.reasonsList}>
            {REASONS.map(reason => (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonItem, selectedReason === reason && styles.reasonItemSelected]}
                onPress={() => setSelectedReason(reason)}
              >
                <View style={[styles.radioBtn, selectedReason === reason && styles.radioBtnSelected]}>
                  {selectedReason === reason && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.reasonText, selectedReason === reason && styles.reasonTextSelected]}>
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.detailsInput}
            placeholder="Additional details (optional)..."
            placeholderTextColor="#555"
            multiline
            maxLength={300}
            value={details}
            onChangeText={setDetails}
          />

          <TouchableOpacity
            style={[styles.submitBtn, (!selectedReason || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!selectedReason || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Report</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            Reports are reviewed by our admin team. False reports may result in account action.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 14 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 20 },
  reasonsList: { marginBottom: 16 },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 8,
    backgroundColor: '#1a1a1a',
  },
  reasonItemSelected: {
    borderColor: '#FF6B00',
    backgroundColor: '#1a0e00',
  },
  radioBtn: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#444',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  radioBtnSelected: { borderColor: '#FF6B00' },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#FF6B00',
  },
  reasonText: { color: '#ccc', fontSize: 15 },
  reasonTextSelected: { color: '#FF6B00', fontWeight: '600' },
  detailsInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: '#ff4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitBtnDisabled: { backgroundColor: '#3a1010' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  note: { color: '#555', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});