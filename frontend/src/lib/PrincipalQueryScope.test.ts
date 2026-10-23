import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { retireQueryClient } from './PrincipalQueryScope';
it('removes private caches and fences late responses that ignore cancellation', async () => {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 client.setQueryData(['users'], ['old principal']);
 let finish!: (value: string[]) => void;
 const pending = client.fetchQuery({ queryKey: ['requests'], queryFn: () => new Promise<string[]>(resolve => { finish = resolve; }) }).catch(() => undefined);
 retireQueryClient(client);
 expect(client.getQueryData(['users'])).toBeUndefined();
 finish(['late private record']); await pending;
 expect(client.getQueryData(['requests'])).toBeUndefined();
});
