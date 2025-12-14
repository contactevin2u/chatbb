import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://chatbaby_db_user:2hxJsnqUMRMCb8lsCe4qvEIDiA1XUO1h@dpg-d4ugfaili9vc73d53c70-a.oregon-postgres.render.com/chatbaby_db?sslmode=require'
    }
  }
});

async function main() {
  console.log('Connecting to database...');
  
  // Check for duplicate identifiers (same identifier, multiple contacts)
  const duplicateIdentifiers = await prisma.$queryRaw`
    SELECT identifier, "channelType", COUNT(*) as count, array_agg(id) as contact_ids
    FROM "Contact"
    WHERE "channelType" = 'WHATSAPP'
    GROUP BY identifier, "channelType"
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `;
  
  console.log('=== DUPLICATE IDENTIFIERS (same phone, multiple contacts) ===');
  console.log(JSON.stringify(duplicateIdentifiers, null, 2));
  
  // Check for contacts with multiple conversations
  const multiConversations = await prisma.$queryRaw`
    SELECT 
      c.identifier,
      c.id as contact_id,
      c."displayName",
      COUNT(conv.id) as conv_count,
      array_agg(conv.id) as conversation_ids
    FROM "Contact" c
    JOIN "Conversation" conv ON conv."contactId" = c.id
    WHERE c."channelType" = 'WHATSAPP'
    GROUP BY c.id
    HAVING COUNT(conv.id) > 1
    LIMIT 20
  `;
  
  console.log('\n=== CONTACTS WITH MULTIPLE CONVERSATIONS ===');
  console.log(JSON.stringify(multiConversations, null, 2));
  
  // Get total counts
  const totalContacts = await prisma.contact.count({ where: { channelType: 'WHATSAPP' } });
  const totalConversations = await prisma.conversation.count();
  
  console.log('\n=== TOTALS ===');
  console.log('Total WhatsApp contacts:', totalContacts);
  console.log('Total conversations:', totalConversations);
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
