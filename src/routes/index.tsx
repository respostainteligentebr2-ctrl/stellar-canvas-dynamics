import { createFileRoute, redirect } from "@tanstack/react-router";
import SingulAIIntroExperience from "@/components/SingulAIIntroExperience";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    if (location.searchStr) return;
    throw redirect({ href: "/genesis.html", reloadDocument: true, statusCode: 302 });
  },
  component: SingulAIIntroExperience,
});
