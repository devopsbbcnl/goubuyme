import React from 'react';
import { TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Number: 0707 890 1075 → international +234 707 890 1075 (wa.me strips the leading 0).
const WHATSAPP_NUMBER = '2347078901075';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hi GoBuyMe 👋 I'd like some help.",
)}`;

/** Floating WhatsApp support button, overlaid across the customer screens. */
export default function WhatsAppFab() {
  const openChat = () => {
    Linking.openURL(WHATSAPP_URL).catch(() => {});
  };

  return (
    <TouchableOpacity
      onPress={openChat}
      activeOpacity={0.85}
      accessibilityLabel="Chat with us on WhatsApp"
      accessibilityRole="button"
      style={styles.fab}
    >
      <Ionicons name="logo-whatsapp" size={30} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 90, // clears the bottom nav on screens that have one
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 900,
    elevation: 8,
    shadowColor: '#25D366',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
