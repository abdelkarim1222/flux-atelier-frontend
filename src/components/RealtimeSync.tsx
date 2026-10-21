import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { hydrateSqlLocalCache } from '../services/api';

const socket = io({
  path: '/socket.io',
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

/** Synchronise les écrans connectés dès qu'une donnée est modifiée ailleurs. */
export default function RealtimeSync() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) {
      socket.disconnect();
      return;
    }

    let refreshTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void hydrateSqlLocalCache(currentUser.role);
        window.dispatchEvent(new CustomEvent('flux_refresh_requested'));
      }, 120);
    };

    socket.on('data:changed', refresh);
    socket.connect();
    return () => {
      window.clearTimeout(refreshTimer);
      socket.off('data:changed', refresh);
      socket.disconnect();
    };
  }, [currentUser]);

  return null;
}
