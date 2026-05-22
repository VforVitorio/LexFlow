import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/domain/EmptyState';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center p-10">
      <EmptyState
        className="max-w-md"
        title="No encontramos esa página"
        description="Comprueba la URL o vuelve al inicio."
        primaryAction={{ label: 'Inicio', onClick: () => navigate('/') }}
      />
    </div>
  );
}
