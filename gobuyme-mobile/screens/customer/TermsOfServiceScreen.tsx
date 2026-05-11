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
const EMAIL = 'legal@gobuyme.shop';

const SECTIONS = [
	{
		title: '1. Acceptance of Terms',
		body: `By downloading, installing, or using the GoBuyMe mobile application ("App"), you agree to be legally bound by these Terms of Service ("Terms") and our Privacy Policy.

These Terms constitute a binding agreement between you and ${COMPANY} ("GoBuyMe", "we", "us", or "our"), a company registered in Nigeria.

If you do not agree to these Terms, do not use the App. We reserve the right to update these Terms at any time with 14 days' notice via the App.`,
	},
	{
		title: '2. Who May Use GoBuyMe',
		body: `You may use GoBuyMe only if:

• You are at least 18 years of age.
• You are legally capable of forming a binding contract under Nigerian law.
• You are not prohibited from using the App under applicable laws.

GoBuyMe offers three user roles — Customer, Vendor, and Rider — each governed by the provisions relevant to that role within these Terms.`,
	},
	{
		title: '3. Account Registration',
		body: `You must create an account to place orders, list products, or accept deliveries. You agree to:

• Provide accurate, current, and complete information during registration.
• Keep your login credentials confidential and not share them with anyone.
• Notify us immediately at ${EMAIL} if you suspect unauthorised access to your account.
• Take responsibility for all activity that occurs under your account.

GoBuyMe reserves the right to suspend or terminate accounts that provide false information or violate these Terms.`,
	},
	{
		title: '4. Customer Terms',
		body: `Placing Orders
When you place an order through the App, you make a binding offer to purchase the selected items at the displayed price. The order is confirmed once the vendor accepts it within the App.

Pricing & Availability
Prices are set by vendors and may change at any time. GoBuyMe displays these prices as provided and is not responsible for pricing errors by vendors. Items are subject to availability.

Delivery Address
You are responsible for providing an accurate and accessible delivery address. GoBuyMe and the rider are not liable for failed deliveries due to an incorrect or inaccessible address.

Cancellations & Refunds
You may cancel an order within 2 minutes of placement at no charge. After the vendor begins preparation, cancellation may not be possible. Refunds for legitimate issues (wrong items, food safety concerns) are processed within 5–10 business days to your original payment method.

Conduct
You agree to treat vendors and riders with respect. Abusive behaviour towards riders or vendors will result in account suspension.`,
	},
	{
		title: '5. Vendor Terms',
		body: `Onboarding
To list products on GoBuyMe, vendors must provide valid business documentation and agree to our Vendor Agreement. GoBuyMe reserves the right to reject or remove any vendor at its discretion.

Product Listings
Vendors are solely responsible for the accuracy, legality, and safety of their product listings, including ingredients, allergen information, and pricing.

Order Fulfilment
Vendors must accept or reject incoming orders within 5 minutes. Repeated rejection of orders or failure to maintain a minimum acceptance rate may result in account suspension.

Payouts
Earnings are calculated after the deduction of GoBuyMe's service fee (as disclosed during onboarding). Payouts are processed weekly to the bank account provided during registration.

Food Safety
Vendors must comply with all applicable Nigerian food safety regulations. GoBuyMe reserves the right to remove listings or suspend vendors found to be in violation.`,
	},
	{
		title: '6. Rider Terms',
		body: `Eligibility
Riders must be at least 18 years old, hold a valid Nigerian driver's licence (where applicable to vehicle type), provide a valid means of identification, and pass a background check.

Independent Contractor
Riders are independent contractors, not employees of GoBuyMe. GoBuyMe does not guarantee a minimum number of delivery requests. Riders are responsible for their own taxes, insurance, and compliance with traffic laws.

GPS & Location
By going online, you consent to GoBuyMe collecting your real-time GPS location for the purpose of routing and sharing your position with the relevant customer during active deliveries. Location tracking stops when you go offline.

Conduct
Riders must handle all orders with care, maintain professional conduct, and adhere to delivery instructions provided in the App. Fraudulent delivery claims will result in immediate suspension.

Earnings
Delivery earnings are credited after each completed delivery and paid out weekly. GoBuyMe charges a platform fee as disclosed in the Rider Agreement.`,
	},
	{
		title: '7. Payments',
		body: `GoBuyMe processes payments via Paystack, a third-party payment processor licensed by the Central Bank of Nigeria (CBN). By making a payment, you also agree to Paystack's terms of service.

Supported payment methods include debit/credit cards and bank transfers. GoBuyMe does not store your full card details; these are securely handled by Paystack.

All transactions are in Nigerian Naira (₦). GoBuyMe is not responsible for currency conversion fees charged by your bank.`,
	},
	{
		title: '8. Prohibited Conduct',
		body: `You agree not to:

• Use the App for any unlawful purpose or to facilitate illegal activities.
• Place fraudulent orders or submit false refund claims.
• Harass, threaten, or abuse other users, vendors, or riders.
• Attempt to reverse-engineer, hack, or disrupt the App or its infrastructure.
• Create multiple accounts to abuse promotions or circumvent suspensions.
• Use automated bots or scripts to interact with the App.
• Resell access to the App or your account credentials.

Violation of these prohibitions may result in immediate account termination and, where appropriate, legal action.`,
	},
	{
		title: '9. Intellectual Property',
		body: `All content in the App — including the GoBuyMe name, logo, design, software, and text — is the exclusive property of ${COMPANY} and is protected by Nigerian and international intellectual property laws.

You are granted a limited, non-exclusive, non-transferable licence to use the App solely for its intended purpose. You may not copy, modify, distribute, or create derivative works from any part of the App without our prior written consent.

User-submitted content (e.g. reviews, photos) remains yours, but you grant GoBuyMe a worldwide, royalty-free licence to use it for operating and promoting the service.`,
	},
	{
		title: '10. Disclaimers & Limitation of Liability',
		body: `The App is provided "as is" without warranties of any kind, express or implied. GoBuyMe does not warrant that the App will be error-free, uninterrupted, or free of viruses.

GoBuyMe acts as a marketplace connecting customers, vendors, and riders. We are not the vendor or the food preparer. We are not liable for food quality, ingredient accuracy, or food safety incidents attributable to a vendor.

To the maximum extent permitted by Nigerian law, GoBuyMe's total liability to you for any claim arising from use of the App shall not exceed the amount you paid for the specific order giving rise to the claim in the 30 days prior to the event.

GoBuyMe is not liable for indirect, incidental, consequential, or punitive damages.`,
	},
	{
		title: '11. Dispute Resolution',
		body: `In-App Support
For order disputes, please contact our support team through the App within 48 hours of the incident. We aim to resolve all disputes within 7 business days.

Governing Law
These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be subject to the exclusive jurisdiction of the courts in Lagos State, Nigeria.

Consumer Protection
Nothing in these Terms limits your rights as a consumer under the Federal Competition and Consumer Protection Act (FCCPA) 2018 or other applicable Nigerian consumer protection laws.`,
	},
	{
		title: '12. Termination',
		body: `You may close your account at any time by navigating to Privacy & Security → Delete My Account in the App.

GoBuyMe may suspend or terminate your account at any time if you violate these Terms, engage in fraudulent activity, or if required by law.

Upon termination, your right to use the App ceases immediately. Provisions that by their nature should survive termination (including intellectual property, liability, and dispute resolution clauses) will remain in force.`,
	},
	{
		title: '13. Contact Us',
		body: `If you have questions about these Terms, please contact us:

${COMPANY}
Email: ${EMAIL}
Address: Lagos, Nigeria

For order support: support@gobuyme.ng
For vendor inquiries: vendors@gobuyme.ng`,
	},
];

export default function TermsOfServiceScreen() {
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
				<Text style={[styles.title, { color: T.text }]}>Terms of Service</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				<View
					style={[
						styles.heroBanner,
						{ backgroundColor: T.infoBg, borderColor: T.info + '44' },
					]}
				>
					<Ionicons name="document-text" size={28} color={T.info} />
					<View style={{ flex: 1, gap: 2 }}>
						<Text style={[styles.heroTitle, { color: T.text }]}>
							Please read these terms carefully
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
						Legal questions? Email us at {EMAIL}
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
