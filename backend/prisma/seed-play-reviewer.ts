/**
 * Seeds ONLY the Google Play reviewer account (customer) — safe to run in production.
 * Idempotent: if the user already exists nothing is duplicated.
 *
 * Run:    npm run seed:play-reviewer
 * Flags:  --yes             skip the interactive confirmation
 *         --reset-password  also reset an existing account's password to the reviewer password
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

const EMAIL = 'adaeze@demo.gobuyme.ng';
const PASSWORD = 'Demo@2026!';

const args = process.argv.slice(2);
const SKIP_CONFIRM = args.includes('--yes');
const RESET_PASSWORD = args.includes('--reset-password');

function dbHost(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim().toLowerCase() === 'yes');
    }),
  );
}

async function main() {
  console.log(`Target database: ${dbHost()}`);
  console.log(`Account:         ${EMAIL}\n`);

  if (!SKIP_CONFIRM && !(await confirm('Type "yes" to continue: '))) {
    console.log('Aborted.');
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { customer: true },
  });

  if (existing) {
    if (existing.role !== Role.CUSTOMER) {
      throw new Error(`${EMAIL} exists but has role ${existing.role}, refusing to modify.`);
    }
    const data: { isActive?: boolean; isEmailVerified?: boolean; password?: string } = {};
    if (!existing.isActive) data.isActive = true;
    if (!existing.isEmailVerified) data.isEmailVerified = true;
    if (RESET_PASSWORD) data.password = await bcrypt.hash(PASSWORD, 12);
    if (Object.keys(data).length) await prisma.user.update({ where: { id: existing.id }, data });
    if (!existing.customer) await prisma.customer.create({ data: { userId: existing.id } });

    console.log(
      `✓ Already exists — left as is${Object.keys(data).length ? ` (updated: ${Object.keys(data).join(', ')})` : ''}.`,
    );
    if (!RESET_PASSWORD) console.log('  Password untouched. Pass --reset-password to force it.');
    return;
  }

  const password = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      name: 'Adaeze Okafor',
      email: EMAIL,
      phone: '+2348031234567',
      password,
      role: Role.CUSTOMER,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-ADAEZE',
      customer: {
        create: {
          addresses: {
            createMany: {
              data: [
                {
                  label: 'Home',
                  address: '15 Rumuola Road',
                  city: 'Port Harcourt',
                  state: 'Rivers',
                  latitude: 4.8241,
                  longitude: 7.0483,
                  isDefault: true,
                },
                {
                  label: 'Office',
                  address: '3 Aba Road, GRA',
                  city: 'Port Harcourt',
                  state: 'Rivers',
                  latitude: 4.8065,
                  longitude: 7.0152,
                  isDefault: false,
                },
              ],
            },
          },
        },
      },
    },
  });
  console.log(`✓ Created ${user.email} with 2 saved addresses.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
