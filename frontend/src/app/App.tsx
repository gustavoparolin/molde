import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import {
  AppShell,
  Avatar,
  Group,
  Menu,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconCube, IconLogout } from "@tabler/icons-react";
import { useAuthStore } from "../store/authStore";
import { signOut } from "../features/auth/authCallbackHandler";
import { SignInPage } from "../features/auth/SignInPage";
import { AuthCallbackPage } from "../features/auth/AuthCallbackPage";
import { ItemsPage } from "../pages/ItemsPage";

function Header() {
  const user = useAuthStore((s) => s.user);

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group gap="xs">
        <ThemeIcon variant="light" color="brand" radius="md">
          <IconCube size={18} />
        </ThemeIcon>
        <Title order={4}>Molde App</Title>
      </Group>

      {user && (
        <Menu position="bottom-end" withArrow>
          <Menu.Target>
            <UnstyledButton>
              <Group gap="xs">
                <Avatar src={user.avatarUrl} radius="xl" size={32} color="brand">
                  {(user.displayName ?? user.email).slice(0, 1).toUpperCase()}
                </Avatar>
                <Text size="sm" fw={500} visibleFrom="xs">
                  {user.displayName ?? user.email}
                </Text>
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconLogout size={16} />} onClick={signOut}>
              Sair
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  );
}

function Shell() {
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();

  // OAuth callback must be reachable before the user is authenticated.
  if (pathname === "/auth/callback") {
    return <AuthCallbackPage />;
  }

  if (!user) {
    return <SignInPage />;
  }

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Header />
      </AppShell.Header>
      <AppShell.Main>
        <Routes>
          <Route path="/" element={<ItemsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
