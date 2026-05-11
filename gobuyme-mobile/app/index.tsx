import { Redirect } from 'expo-router';

// Entry point — always start at splash
export default function Index() {
  return <Redirect href="/splash" />;
}
