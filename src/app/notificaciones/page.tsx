import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { CentroNotificaciones } from '@/components/notificaciones/CentroNotificaciones';

export default function PaginaNotificaciones() {
  return (
    <DisposicionRol actual="/notificaciones" roles={['USUARIO', 'ADMIN']}>
      <h1>Notificaciones</h1>
      <CentroNotificaciones />
    </DisposicionRol>
  );
}
