import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client'; // adjust to your actual export

export function useUsageStatus() {
  const [status, setStatus] = useState(null); // { limited, used, remaining }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/usage-status')
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  return { status, loading };
}