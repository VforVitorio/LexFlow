import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/domain/EmptyState';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center p-10">
      <EmptyState
        className="max-w-md"
        title={t('errors.notFoundTitle')}
        description={t('errors.notFoundDescription')}
        primaryAction={{ label: t('errors.home'), onClick: () => navigate('/home') }}
      />
    </div>
  );
}
