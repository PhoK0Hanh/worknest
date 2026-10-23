import { getPrisma } from "./prisma.js";
import { getFirebaseAdminAuth } from "./firebase-admin.js";

let running = false;
export async function cleanupDeletedAccounts() {
  if (running) return;
  running = true;
  try {
    // Inactive Neon rows are durable deletion requests. Retry Firebase cleanup after outages/restarts.
    const users = await getPrisma().user.findMany({ where: { isActive: false, deletedAt: { not: null } }, select: { firebaseUid: true } });
    for (let offset = 0; offset < users.length; offset += 100) {
      const found = await getFirebaseAdminAuth().getUsers(users.slice(offset, offset + 100).map(user => ({ uid: user.firebaseUid })));
      for (const user of found.users) await getFirebaseAdminAuth().deleteUser(user.uid);
    }
  } catch { console.error("Account cleanup will retry; Firebase or database temporarily unavailable."); }
  finally { running = false; }
}
