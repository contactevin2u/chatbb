/**
 * Script to check for potential duplicate contacts
 * Run with: npx ts-node scripts/check-duplicates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all WhatsApp contacts
  const contacts = await prisma.contact.findMany({
    where: { channelType: 'WHATSAPP' },
    orderBy: { createdAt: 'asc' },
    include: {
      conversations: {
        include: {
          channel: true,
          _count: { select: { messages: true } },
        },
      },
    },
  });

  console.log(`Total WhatsApp contacts: ${contacts.length}\n`);

  // Group contacts by the last 10 digits of their identifier
  const grouped: Record<string, typeof contacts> = {};

  for (const contact of contacts) {
    // Get last 10 digits for comparison (handles country code differences)
    const last10 = contact.identifier.slice(-10);
    if (!grouped[last10]) {
      grouped[last10] = [];
    }
    grouped[last10].push(contact);
  }

  // Find potential duplicates
  console.log('=== Potential Duplicates (same last 10 digits) ===\n');

  for (const [key, group] of Object.entries(grouped)) {
    if (group.length > 1) {
      console.log(`Last 10 digits: ${key}`);
      for (const c of group) {
        console.log(`  - ID: ${c.id}`);
        console.log(`    Identifier: "${c.identifier}"`);
        console.log(`    DisplayName: ${c.displayName || 'null'}`);
        console.log(`    Created: ${c.createdAt}`);
        console.log(`    Conversations: ${c.conversations.length}`);
        for (const conv of c.conversations) {
          console.log(`      - Conv ID: ${conv.id}`);
          console.log(`        Channel: ${conv.channel.name} (${conv.channelId})`);
          console.log(`        Messages: ${conv._count.messages}`);
          console.log(`        Status: ${conv.status}`);
        }
      }
      console.log('');
    }
  }

  // Also check for contacts with similar but different identifiers
  console.log('\n=== All Contact Identifiers ===\n');
  const identifiers = contacts.map(c => ({
    id: c.id,
    identifier: c.identifier,
    displayName: c.displayName,
    convCount: c.conversations.length,
  }));

  console.table(identifiers.slice(0, 50)); // Show first 50
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
