import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <SignIn routing="hash" signUpUrl="/sign-up" />
    </div>
  );
}
