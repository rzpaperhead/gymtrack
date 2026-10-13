import { AppProviders } from "@/components/providers/app-providers";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <AppProviders>{children}</AppProviders>;
}
