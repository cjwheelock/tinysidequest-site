import { GateError, messages, parseRedeemedAccess, selectEnterprisePack, checkedPreview } from './core.js';

const isUnauthorized = error => Number(error?.context?.status ?? error?.status) === 401
  || ['PGRST301', 'bad_jwt', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error?.code);

export function createGateApi(client, config) {
  async function retryExpired(operation) {
    let result = await operation();
    if (result.error && isUnauthorized(result.error)) {
      const fresh = await client.auth.refreshSession();
      if (fresh.error || !fresh.data?.session) throw new GateError('expired', messages.expired);
      result = await operation();
    }
    return result;
  }
  async function currentSession(allowCreate = false) {
    const result = await client.auth.getSession();
    if (result.error) throw new GateError('expired', messages.expired);
    if (result.data?.session) return result.data.session;
    if (!allowCreate) return null;
    // Matches the existing /code/ flow; invoked only after an explicit Continue.
    const created = await client.auth.signInAnonymously();
    if (created.error || !created.data?.session) throw new GateError('unavailable', messages.unavailable);
    return created.data.session;
  }
  return {
    async resume() {
      if (!await currentSession()) return null;
      const result = await retryExpired(() => client.rpc('get_my_enterprise_web_access'));
      if (result.error) throw new GateError(isUnauthorized(result.error) ? 'expired' : 'unavailable', isUnauthorized(result.error) ? messages.expired : messages.unavailable);
      return result.data ? selectEnterprisePack(result.data) : null;
    },
    async redeem(code) {
      await currentSession(true);
      const result = await retryExpired(() => client.rpc('redeem_enterprise_web_code', { p_code: code }));
      if (result.error) throw new GateError(isUnauthorized(result.error) ? 'expired' : 'unavailable', isUnauthorized(result.error) ? messages.expired : messages.unavailable);
      return parseRedeemedAccess(result.data);
    },
    async preview(packId) {
      if (!await currentSession()) throw new GateError('expired', messages.expired);
      // Supabase functions.invoke sends the current session bearer token. The server rechecks it.
      const result = await retryExpired(() => client.functions.invoke('institution-teaser', { body: { packId } }));
      if (result.error) {
        const status = Number(result.error?.context?.status ?? result.error?.status);
        if (status === 401 || status === 403) throw new GateError('expired', messages.expired);
        if (status === 404 || status === 503) throw new GateError('missing', messages.missing);
        throw new GateError('preview', messages.preview);
      }
      return checkedPreview(result.data, config);
    },
  };
}
