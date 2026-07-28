// Usage:
//   npx ts-node scripts/reset-admin-password.ts --email user747-777@gobuyme.shop
// Password is prompted interactively (masked, never passed as an arg/env var so it
// doesn't land in shell history or process listings). Also clears the account's
// refreshToken so any existing session is invalidated immediately.
import { PrismaClient } from '@prisma/client';
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
  const email = arg('--email') ?? (await prompt('Email: '));
  if (!email || !email.includes('@')) throw new Error('Valid email is required.');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user found with email ${email}.`);
  if (!['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'].includes(user.role)) {
    throw new Error(`${email} is a ${user.role} account, not an admin. Refusing to touch it — use the right tool for that role.`);
  }

  const password = await prompt('New password (min 8 chars): ', true);
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const confirm = await prompt('Confirm new password: ', true);
  if (password !== confirm) throw new Error('Passwords do not match.');

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { email },
    data: { password: hashed, refreshToken: null },
  });

  console.log(`\n✅ Password updated for ${email} (${user.role}). Existing session invalidated.`);
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
