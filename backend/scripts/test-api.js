const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  // Simulate what the API does: get last 50 messages ordered by createdAt DESC
  const result = await client.query(`
    SELECT id, type, direction, content->>'text' as text,
           created_at
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `, [CONV_ID]);

  console.log('=== API would return these 50 messages ===\n');
  console.log('Total returned:', result.rows.length);

  // Check if OC4648 is in the first 50
  const oc4648 = result.rows.find(m => m.text && m.text.includes('OC4648'));
  if (oc4648) {
    console.log('\n✅ OC4648 IS in first 50 messages!');
    console.log('   Position:', result.rows.indexOf(oc4648) + 1);
    console.log('   ID:', oc4648.id);
    console.log('   Created:', oc4648.created_at);
  } else {
    console.log('\n❌ OC4648 is NOT in first 50 messages');

    // Find its actual position
    const all = await client.query(`
      SELECT id, content->>'text' as text,
             ROW_NUMBER() OVER (ORDER BY created_at DESC) as pos
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
    `, [CONV_ID]);

    const msg = all.rows.find(m => m.text && m.text.includes('OC4648'));
    if (msg) {
      console.log('   Actual position:', msg.pos);
      console.log('   (User needs to scroll/load more to see it)');
    }
  }

  // Show first few messages
  console.log('\n=== First 5 messages in API response ===');
  result.rows.slice(0, 5).forEach((m, i) => {
    console.log(`${i + 1}. [${m.type}] ${m.direction} - ${(m.text || '[no text]').slice(0, 40)}`);
  });

  await client.end();
}

run().catch(console.error);
