import React from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const EFFECTIVE_DATE = 'May 1, 2025';
const COMPANY = 'Bubble Barrel Commerce Ltd.';
const EMAIL = 'privacy@gobuyme.shop';

const SECTIONS = [
	{
		title: '1. Introduction',
		body: `Welcome to GoBuyMe, operated by ${COMPANY} ("we", "us", or "our"). We are committed to protecting your personal data in accordance with the Nigeria Data Protection Regulation (NDPR) and the Nigeria Data Protection Act 2023 (NDPA).

This Privacy Policy explains what information we collect, why we collect it, how we use and share it, and the choices you have. By using the GoBuyMe app, you agree to the practices described here.`,
	},
	{
		title: '2. Information We Collect',
		body: `We collect information you provide directly and information generated as you use our service:

Account Information
Your full name, email address, phone number, and password when you register.

Profile & Role Data
For customers: saved delivery addresses and payment preferences.
For vendors: business name, business address, menu items, and banking details for payouts.
For riders: national ID, vehicle details, and bank account information.

Order & Transaction Data
Items ordered, delivery addresses, payment amounts, and order history.

Location Data
If you are a rider, we collect your precise GPS location while you are marked online to enable live delivery tracking. Customers share a delivery address only — no background location tracking.

Device & Usage Data
Device type, operating system, IP address, app version, and in-app activity logs for debugging and security purposes.

Communications
Messages and support tickets you send us.`,
	},
	{
		title: '3. How We Use Your Information',
		body: `We process your data only for the following purposes:

• To create and manage your account.
• To process orders, calculate delivery routes, and coordinate between customers, vendors, and riders.
• To process payments and remit earnings to vendors and riders.
• To send order confirmations, status updates, and delivery notifications.
• To improve app performance, fix bugs, and build new features.
• To detect, investigate, and prevent fraud, abuse, or violations of our Terms of Service.
• To comply with legal obligations under Nigerian law.`,
	},
	{
		title: '4. Legal Basis for Processing',
		body: `We process your personal data on the following legal bases as defined by the NDPA 2023:

Contract Performance: processing necessary to fulfil orders you place or deliver.

Legitimate Interests: fraud prevention, platform security, and improving our services.

Consent: marketing communications and non-essential cookies — you may withdraw consent at any time.

Legal Obligation: tax records, regulatory filings, and law-enforcement cooperation.`,
	},
	{
		title: '5. Sharing Your Information',
		body: `We do not sell your personal data. We share information only in the following circumstances:

Service Providers
We share data with payment processors (Paystack), cloud hosting providers, push notification services, and mapping providers strictly to operate GoBuyMe.

Between Users
Your first name and order details are shared with the vendor fulfilling your order. Your first name and live location (while delivering) are shared with the customer you are delivering to.

Legal Requirements
We may disclose data when required by a court order, government authority, or to protect the rights and safety of our users.

Business Transfers
In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity. We will notify you before your data is governed by a different privacy policy.`,
	},
	{
		title: '6. Data Retention',
		body: `We retain your account data for as long as your account is active and for 6 years thereafter to meet our legal and regulatory obligations under Nigerian law.

Order and transaction records are retained for 7 years for tax and financial audit purposes.

You may request deletion of your account at any time. Upon deletion, your personal identifiers will be anonymised within 30 days, except where retention is required by law.`,
	},
	{
		title: '7. Your Rights',
		body: `Under the NDPA 2023 you have the right to:

• Access: request a copy of the personal data we hold about you.
• Correction: request that inaccurate data be corrected.
• Deletion: request erasure of your data (subject to legal retention requirements).
• Portability: receive your data in a structured, machine-readable format.
• Objection: object to processing based on legitimate interests.
• Restriction: request that we limit how we use your data while a complaint is resolved.
• Withdraw Consent: withdraw any consent you previously gave at any time.

To exercise any of these rights, contact us at ${EMAIL} or use the "Download My Data" option in Privacy & Security settings. We will respond within 30 days.`,
	},
	{
		title: '8. Data Security',
		body: `We implement industry-standard security measures including:

• TLS 1.2+ encryption for all data in transit.
• AES-256 encryption for sensitive data at rest.
• JWT-based authentication with short expiry and refresh tokens.
• Access controls limiting data visibility to authorised personnel only.
• Regular security audits and vulnerability assessments.

No system is 100% secure. If you believe your account has been compromised, please contact us immediately at ${EMAIL}.`,
	},
	{
		title: '9. Children\'s Privacy',
		body: `GoBuyMe is not intended for users under the age of 18. We do not knowingly collect personal data from minors. If we discover that a child under 18 has provided us with personal information, we will delete it immediately.`,
	},
	{
		title: '10. Third-Party Links',
		body: `The app may contain links to third-party websites or services (e.g. payment gateways). We are not responsible for the privacy practices of those third parties. We encourage you to review their privacy policies before submitting personal information.`,
	},
	{
		title: '11. Changes to This Policy',
		body: `We may update this Privacy Policy from time to time. When we make material changes, we will notify you via a push notification and display the updated policy in the app at least 14 days before the changes take effect. Continued use of the app after that date constitutes acceptance of the updated policy.`,
	},
	{
		title: '12. Contact Us',
		body: `If you have questions, concerns, or complaints about this Privacy Policy or our data practices, please contact our Data Protection Officer:

Bubble Barrel Technologies Ltd.
Email: ${EMAIL}
Address: Lagos, Nigeria

You also have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) at www.ndpc.gov.ng if you believe your data rights have been violated.`,
	},
];

export default function PrivacyPolicyScreen() {
	const { theme: T } = useTheme();

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<View style={[styles.header, { borderBottomColor: T.border }]}>
				<TouchableOpacity
					onPress={() => router.back()}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>Privacy Policy</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				<View
					style={[
						styles.heroBanner,
						{ backgroundColor: T.primaryTint, borderColor: T.primary + '33' },
					]}
				>
					<Ionicons name="shield-checkmark" size={28} color={T.primary} />
					<View style={{ flex: 1, gap: 2 }}>
						<Text style={[styles.heroTitle, { color: T.text }]}>
							Your privacy matters to us
						</Text>
						<Text style={[styles.heroSub, { color: T.textSec }]}>
							Effective {EFFECTIVE_DATE} · {COMPANY}
						</Text>
					</View>
				</View>

				{SECTIONS.map((section) => (
					<View key={section.title} style={{ gap: 8 }}>
						<Text style={[styles.sectionTitle, { color: T.text }]}>
							{section.title}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{ backgroundColor: T.surface, borderColor: T.border },
							]}
						>
							<Text style={[styles.bodyText, { color: T.textSec }]}>
								{section.body}
							</Text>
						</View>
					</View>
				))}

				<View
					style={[
						styles.footerNote,
						{ backgroundColor: T.surface2, borderColor: T.border },
					]}
				>
					<Ionicons name="mail-outline" size={16} color={T.textMuted} />
					<Text style={[styles.footerText, { color: T.textMuted }]}>
						Questions? Email us at {EMAIL}
					</Text>
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingBottom: 16,
		paddingTop: 16,
		paddingHorizontal: 20,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: { fontSize: 17, fontWeight: '700' },
	scroll: { padding: 20, gap: 20, paddingBottom: 48 },
	heroBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 14,
		padding: 16,
		borderRadius: 8,
		borderWidth: 1,
	},
	heroTitle: { fontSize: 14, fontWeight: '700' },
	heroSub: { fontSize: 12, fontWeight: '500' },
	sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
	sectionCard: {
		borderRadius: 4,
		borderWidth: 1,
		padding: 16,
	},
	bodyText: { fontSize: 13, fontWeight: '400', lineHeight: 21 },
	footerNote: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		padding: 14,
		borderRadius: 4,
		borderWidth: 1,
	},
	footerText: { fontSize: 12, fontWeight: '500' },
});
