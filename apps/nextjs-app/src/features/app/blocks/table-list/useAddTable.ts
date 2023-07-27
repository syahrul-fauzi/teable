import { useSpace, useTables } from '@teable-group/sdk/hooks';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

export function useAddTable() {
  const space = useSpace();
  const tables = useTables();
  const tableName = 'new table ' + tables.length;
  const router = useRouter();

  return useCallback(async () => {
    const tableData = await space.createTable({ name: tableName });
    const tableId = tableData.id;
    router.push({
      pathname: '/space/[tableId]',
      query: { tableId: tableId },
    });
  }, [router, space, tableName]);
}