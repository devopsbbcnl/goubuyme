import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const STAFF = [
  { name: 'GoBuyMe Admin',      email: 'admin@gobuyme.shop',      role: Role.SUPER_ADMIN,       password: 'Admin@2026!' },
  { name: 'Operations Manager', email: 'ops@gobuyme.shop',        role: Role.OPERATIONS_ADMIN,  password: 'Ops@2026!' },
  { name: 'Support Agent',      email: 'support@gobuyme.shop',    role: Role.SUPPORT_ADMIN,     password: 'Support@2026!' },
];

async function main() {
  for (const staff of STAFF) {
    const existing = await prisma.user.findUnique({ where: { email: staff.email } });
    if (existing) {
      console.log(`Already exists: ${staff.email}`);
      continue;
    }

    const hashed = await bcrypt.hash(staff.password, 12);
    const user = await prisma.user.create({
      data: {
        name: staff.name,
        email: staff.email,
        password: hashed,
        role: staff.role,
        isEmailVerified: true,
        isActive: true,
        referralCode: `${staff.role.slice(0, 3)}${Date.now()}`,
      },
    });

    console.log(`✅ ${user.role} created:`);
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${staff.password}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
