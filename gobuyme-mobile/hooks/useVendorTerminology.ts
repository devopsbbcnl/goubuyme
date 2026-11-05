import { useEffect, useState } from 'react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_TERMINOLOGY, VendorTerminology } from '@/utils/vendorTerminology';

// Module-level cache keyed by user so a logout/login as another vendor refetches.
let cached: { userId: string; terms: VendorTerminology } | null = null;

/** The signed-in vendor's category-specific naming ("Menu", "Products", ...). */
export function useVendorTerminology(): VendorTerminology {
	const { user } = useAuth();
	const userId = user?.id;
	const [terms, setTerms] = useState<VendorTerminology>(
		cached && cached.userId === userId ? cached.terms : DEFAULT_TERMINOLOGY,
	);

	useEffect(() => {
		if (!userId) return;
		if (cached?.userId === userId) {
			setTerms(cached.terms);
			return;
		}
		api.get('/vendors/me')
			.then((res) => {
				const t = res.data.data?.terminology;
				if (t) {
					cached = { userId, terms: t };
					setTerms(t);
				}
			})
			.catch(() => {});
	}, [userId]);

	return terms;
}
