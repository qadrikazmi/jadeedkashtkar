// src/pages/ResetPasswordPage.jsx
import { useSearchParams, useNavigate } from 'react-router-dom';
import ResetPasswordModal from '@/components/auth/ResetPasswordModal';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  return (
    <ResetPasswordModal
      token={token}
      onSwitchToLogin={() => navigate('/')}
    />
  );
}