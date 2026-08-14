import { CustomerNav } from '@/components/layout/CustomerNav';
import { CustomerFooter } from '@/components/layout/CustomerFooter';

export default function VendorDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CustomerNav />
      <main style={{ flex: 1 }}>
        {children}
      </main>
      <CustomerFooter />
    </div>
  );
}
