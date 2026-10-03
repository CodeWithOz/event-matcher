/**
 * Safety guard for destructive scripts (seeding wipes collections).
 * Refuses to run against anything other than a local MongoDB unless
 * ALLOW_REMOTE_DB=true is set explicitly.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const isLocalMongoUri = (uri: string): boolean => {
  // mongodb+srv:// always points to a remote cluster (e.g. Atlas)
  if (!uri.startsWith('mongodb://')) return false;

  const withoutScheme = uri.slice('mongodb://'.length);
  const authority = withoutScheme.split(/[/?]/)[0];
  const hostList = authority.slice(authority.lastIndexOf('@') + 1);

  return hostList
    .split(',')
    .every((hostPort) => {
      const host = hostPort.startsWith('[')
        ? hostPort.slice(0, hostPort.indexOf(']') + 1)
        : hostPort.split(':')[0];
      return LOCAL_HOSTS.has(host);
    });
};

export const assertSafeToWipe = (uri: string, scriptName: string): void => {
  if (isLocalMongoUri(uri) || process.env.ALLOW_REMOTE_DB === 'true') {
    return;
  }

  throw new Error(
    `${scriptName} deletes existing data, but MONGODB_URI does not point to a local database. ` +
      'Use the local Docker database (see README), or set ALLOW_REMOTE_DB=true to run it anyway.'
  );
};
