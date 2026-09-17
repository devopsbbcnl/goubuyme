import { Redirect } from 'expo-router';

// Older links and notifications pointed here; the help center replaced the support chat.
export default function ContactSupportRedirect() {
  return <Redirect href="/help" />;
}
