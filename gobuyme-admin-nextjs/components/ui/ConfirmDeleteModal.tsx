'use client';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from './Modal';

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  itemName: string;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
  isDangerous?: boolean;
}

export function ConfirmDeleteModal({
  open, onClose, title, message, itemName, onConfirm, isLoading = false, isDangerous = false,
}: ConfirmDeleteModalProps) {
  const { theme: T } = useTheme();

  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title} width={480}>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 14, color: T.textSec, margin: 0, lineHeight: 1.6 }}>
            {message}
          </p>
          <div style={{
            background: isDangerous ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            border: `1px solid ${isDangerous ? '#fecaca' : '#bfdbfe'}`,
            borderRadius: 4, padding: 12,
          }}>
            <div style={{ fontSize: 13, color: isDangerous ? '#dc2626' : '#1e40af', fontWeight: 600 }}>
              {itemName}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px', borderRadius: 4, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.text,
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            style={{
              padding: '8px 16px', borderRadius: 4, border: 'none',
              background: isDangerous ? '#ef4444' : '#3b82f6', color: '#fff',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
