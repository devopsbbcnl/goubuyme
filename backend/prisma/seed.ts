import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@gobuyme.shop';
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const password = await bcrypt.hash('Admin@2026!', 12);
  const referralCode = `ADM${Date.now()}`;

  const user = await prisma.user.create({
    data: {
      name: 'GoBuyMe Admin',
      email,
      password,
      role: Role.SUPER_ADMIN,
      isEmailVerified: true,
      isActive: true,
      referralCode,
    },
  });

  console.log(`✅ SUPER_ADMIN created:`);
  console.log(`   Email:    ${user.email}`);
  console.log(`   Password: Admin@2026!`);
  console.log(`   ID:       ${user.id}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
