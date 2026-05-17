import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <SignUp routing="hash" signInUrl="/login" />
    </div>
  );
}
