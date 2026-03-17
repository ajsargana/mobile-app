import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

export const PINEntryScreen = ({ navigation, route }: any) => {
  const mode: 'auth' | 'change' = route?.params?.mode || 'auth';
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const getActivePin = () => {
    if (step === 'current') return currentPin;
    if (step === 'new') return newPin;
    return confirmPin;
  };

  const getTitle = () => {
    if (mode === 'change') {
      if (step === 'current') return 'Enter Current PIN';
      if (step === 'new') return 'Enter New PIN';
      return 'Confirm New PIN';
    }
    // auth mode
    if (step === 'new') return 'Create PIN';
    if (step === 'confirm') return 'Confirm PIN';
    return 'Enter PIN';
  };

  const appendDigit = (digit: string) => {
    const active = getActivePin();
    if (active.length >= 6) return;
    if (step === 'current') setCurrentPin(prev => prev + digit);
    else if (step === 'new') setNewPin(prev => prev + digit);
    else setConfirmPin(prev => prev + digit);
  };

  const deleteDigit = () => {
    if (step === 'current') setCurrentPin(prev => prev.slice(0, -1));
    else if (step === 'new') setNewPin(prev => prev.slice(0, -1));
    else setConfirmPin(prev => prev.slice(0, -1));
  };

  const handleSubmit = async () => {
    try {
      if (mode === 'auth') {
        if (step === 'current') {
          const storedPin = await SecureStore.getItemAsync('user_pin');
          if (!storedPin) {
            // No PIN yet — prompt to create one
            setStep('new');
          } else if (currentPin !== storedPin) {
            Alert.alert('Incorrect PIN', 'The PIN you entered is incorrect.');
            setCurrentPin('');
          } else {
            route.params?.onSuccess?.();
            navigation.goBack();
          }
        } else if (step === 'new') {
          if (newPin.length < 4) {
            Alert.alert('PIN Too Short', 'Your PIN must be at least 4 digits.');
            setNewPin('');
            return;
          }
          setStep('confirm');
        } else if (step === 'confirm') {
          if (confirmPin !== newPin) {
            Alert.alert('PINs Do Not Match', 'The PINs you entered do not match. Please try again.');
            setConfirmPin('');
            setStep('new');
            setNewPin('');
            return;
          }
          await SecureStore.setItemAsync('user_pin', newPin);
          route.params?.onSuccess?.();
          navigation.goBack();
        }
      } else {
        // change mode — existing 3-step flow
        if (step === 'current') {
          const storedPin = await SecureStore.getItemAsync('user_pin');
          if (storedPin && currentPin !== storedPin) {
            Alert.alert('Incorrect PIN', 'The current PIN you entered is incorrect.');
            setCurrentPin('');
            return;
          }
          setStep('new');
        } else if (step === 'new') {
          if (newPin.length < 4) {
            Alert.alert('PIN Too Short', 'Your PIN must be at least 4 digits.');
            setNewPin('');
            return;
          }
          setStep('confirm');
        } else if (step === 'confirm') {
          if (confirmPin !== newPin) {
            Alert.alert('PINs Do Not Match', 'The PINs you entered do not match. Please try again.');
            setConfirmPin('');
            setStep('new');
            setNewPin('');
            return;
          }
          await SecureStore.setItemAsync('user_pin', newPin);
          Alert.alert('PIN Updated', 'Your PIN has been changed successfully.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process PIN. Please try again.');
    }
  };

  useEffect(() => {
    if (getActivePin().length === 6) {
      handleSubmit();
    }
  }, [currentPin, newPin, confirmPin]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{getTitle()}</Text>

      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View
            key={i}
            style={[styles.dot, getActivePin().length > i && styles.dotFilled]}
          />
        ))}
      </View>

      <View style={styles.keypad}>
        {digits.map((digit, index) =>
          digit === '' ? (
            <View key={index} style={styles.keypadEmpty} />
          ) : digit === 'del' ? (
            <TouchableOpacity key={index} style={styles.keypadButton} onPress={deleteDigit}>
              <Ionicons name="backspace-outline" size={24} color="#2C3E50" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              key={index}
              style={styles.keypadButton}
              onPress={() => appendDigit(digit)}
            >
              <Text style={styles.keypadDigit}>{digit}</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginBottom: 48,
    gap: 16,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#667eea',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#667eea',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 264,
    justifyContent: 'center',
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 8,
  },
  keypadEmpty: {
    width: 72,
    height: 72,
    margin: 8,
  },
  keypadDigit: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2C3E50',
  },
});
