import { SidebarProvider } from '@/components/ui/sidebar'

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>
}
