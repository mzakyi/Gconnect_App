const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ⭐ THIS MUST MATCH what you typed in Step 1
const ORG_ID = 'sankatos';

const COLLECTIONS = [
  'announcements',
  'events',
  'posts',
  'users',
  'groupChats',
  'privateChats',
  'notifications',
  'stories',
  'sharedPosts',
  'onlineUsers',
  'recentActivity',
  'groupChatMembers',
];

async function migrateCollection(collectionName) {
  console.log(`\n📦 Migrating: ${collectionName}`);

  const snapshot = await db.collection(collectionName).get();

  if (snapshot.empty) {
    console.log(`   ⚠️  No documents found — skipping`);
    return;
  }

  // Firestore batches max out at 500 docs, so we chunk
  const docs = [];
  snapshot.forEach(doc => docs.push(doc));

  const chunkSize = 499;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const batch = db.batch();

    chunk.forEach(doc => {
      const newRef = db
        .collection('organizations')
        .doc(ORG_ID)
        .collection(collectionName)
        .doc(doc.id);

      batch.set(newRef, doc.data());
    });

    await batch.commit();
    console.log(`   ✅ Migrated ${chunk.length} documents`);
  }
}

async function migrateSubcollections() {
  // groupChats/{groupId}/messages
  console.log(`\n📦 Migrating: groupChats/messages (subcollection)`);
  const groupsSnapshot = await db.collection('groupChats').get();

  for (const groupDoc of groupsSnapshot.docs) {
    const messagesSnapshot = await db
      .collection('groupChats')
      .doc(groupDoc.id)
      .collection('messages')
      .get();

    if (messagesSnapshot.empty) continue;

    const batch = db.batch();
    messagesSnapshot.forEach(msgDoc => {
      const newRef = db
        .collection('organizations')
        .doc(ORG_ID)
        .collection('groupChats')
        .doc(groupDoc.id)
        .collection('messages')
        .doc(msgDoc.id);

      batch.set(newRef, msgDoc.data());
    });

    await batch.commit();
    console.log(`   ✅ Migrated messages for group: ${groupDoc.id}`);
  }

  // privateChats/{chatId}/messages
  console.log(`\n📦 Migrating: privateChats/messages (subcollection)`);
  const chatsSnapshot = await db.collection('privateChats').get();

  for (const chatDoc of chatsSnapshot.docs) {
    const messagesSnapshot = await db
      .collection('privateChats')
      .doc(chatDoc.id)
      .collection('messages')
      .get();

    if (messagesSnapshot.empty) continue;

    const batch = db.batch();
    messagesSnapshot.forEach(msgDoc => {
      const newRef = db
        .collection('organizations')
        .doc(ORG_ID)
        .collection('privateChats')
        .doc(chatDoc.id)
        .collection('messages')
        .doc(msgDoc.id);

      batch.set(newRef, msgDoc.data());
    });

    await batch.commit();
    console.log(`   ✅ Migrated messages for chat: ${chatDoc.id}`);
  }

  // posts/{postId}/comments
  console.log(`\n📦 Migrating: posts/comments (subcollection)`);
  const postsSnapshot = await db.collection('posts').get();

  for (const postDoc of postsSnapshot.docs) {
    const commentsSnapshot = await db
      .collection('posts')
      .doc(postDoc.id)
      .collection('comments')
      .get();

    if (commentsSnapshot.empty) continue;

    const batch = db.batch();
    commentsSnapshot.forEach(commentDoc => {
      const newRef = db
        .collection('organizations')
        .doc(ORG_ID)
        .collection('posts')
        .doc(postDoc.id)
        .collection('comments')
        .doc(commentDoc.id);

      batch.set(newRef, commentDoc.data());
    });

    await batch.commit();
    console.log(`   ✅ Migrated comments for post: ${postDoc.id}`);
  }
}

async function main() {
  console.log(`🚀 Starting migration → org: "${ORG_ID}"`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Migrate all top-level collections
  for (const col of COLLECTIONS) {
    await migrateCollection(col);
  }

  // Migrate subcollections (messages, comments)
  await migrateSubcollections();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 Migration complete!`);
  console.log(`\n⚠️  IMPORTANT: Your old flat collections still exist.`);
  console.log(`   Only delete them AFTER you verify the app works correctly.`);
}

main().catch(err => {
  console.error('💥 Migration failed:', err);
  process.exit(1);
});

// Add this at the bottom of migrate.js and run again if needed
async function patchUserOrgIds() {
  console.log('\n🔧 Patching organizationId on all users...');
  const usersSnapshot = await db
    .collection('organizations')
    .doc(ORG_ID)
    .collection('users')
    .get();

  const batch = db.batch();
  usersSnapshot.forEach(doc => {
    batch.update(doc.ref, { organizationId: ORG_ID });
  });

  await batch.commit();
  console.log(`✅ Patched ${usersSnapshot.size} users with organizationId: "${ORG_ID}"`);
}

// Call it inside main() after the migration
patchUserOrgIds().catch(console.error);