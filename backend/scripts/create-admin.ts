// Usage:
//   npx ts-node scripts/create-admin.ts --name "Jane Doe" --email jane@gobuyme.shop --role SUPER_ADMIN
// Password is prompted interactively (not passed as an arg/env var, so it never
// ends up in shell history or process listings). Role defaults to SUPER_ADMIN.
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function prompt(question: string, hide = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hide) {
      // Mask input so the password isn't echoed to the terminal.
      const write = (rl as any)._writeToOutput.bind(rl);
      (rl as any)._writeToOutput = (str: string) => {
        write(str.startsWith(question) ? question : '*');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const name = arg('--name') ?? (await prompt('Name: '));
  const email = arg('--email') ?? (await prompt('Email: '));
  const roleArg = (arg('--role') ?? 'SUPER_ADMIN').toUpperCase();

  if (!(roleArg in Role) || !['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'].includes(roleArg)) {
    throw new Error(`Invalid role "${roleArg}". Use SUPER_ADMIN, OPERATIONS_ADMIN, or SUPPORT_ADMIN.`);
  }
  if (!email || !email.includes('@')) throw new Error('Valid email is required.');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error(`A user with email ${email} already exists (role: ${existing.role}).`);

  const password = await prompt('Password (min 8 chars): ', true);
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: roleArg as Role,
      isEmailVerified: true,
      isActive: true,
      referralCode: `ADM-${Date.now().toString(36).toUpperCase()}`,
    },
  });

  console.log(`\n✅ ${user.role} created: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
