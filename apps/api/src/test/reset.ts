/** Wipes all Firestore documents of the given project in the running emulator. */
export async function resetEmulator(projectId: string, host = 'localhost:8080'): Promise<void> {
  const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Emulator reset failed with status ${res.status}`);
  }
}
