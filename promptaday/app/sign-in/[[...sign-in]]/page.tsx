import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "4rem 1.5rem",
      }}
    >
      <SignIn />
    </main>
  );
}
