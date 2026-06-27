import { useState } from "react";
import {
  Anchor,
  Box,
  Button,
  Center,
  Collapse,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconBrandGoogle, IconCube } from "@tabler/icons-react";
import { initiateGoogleSignIn, mockGoogleSignIn } from "./authCallbackHandler";

export function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [devOpen, devHandlers] = useDisclosure(false);
  const [email, setEmail] = useState("you@gmail.com");
  const [name, setName] = useState("Demo User");

  async function handleGoogleSignIn() {
    setBusy(true);
    try {
      await initiateGoogleSignIn();
    } catch {
      notifications.show({
        color: "red",
        message: "Não foi possível iniciar o login com Google. Tente novamente.",
      });
      setBusy(false);
    }
  }

  async function handleMockSignIn() {
    if (!email || !name) return;
    setBusy(true);
    try {
      await mockGoogleSignIn(email, name);
    } catch {
      notifications.show({ color: "red", message: "Não foi possível entrar. Tente novamente." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--mantine-spacing-md)",
        background:
          "radial-gradient(1200px 600px at 50% -10%, var(--mantine-color-brand-1), transparent), var(--mantine-color-body)",
      }}
    >
      <Paper withBorder shadow="md" radius="lg" p="xl" w={400} maw="100%">
        <Stack align="center" gap="xs" mb="lg">
          <ThemeIcon size={56} radius="md" variant="light" color="brand">
            <IconCube size={32} />
          </ThemeIcon>
          <Title order={2}>Molde App</Title>
          <Text c="dimmed" size="sm" ta="center">
            Esqueleto do Parolin Stack. Substitua este texto pela proposta do seu app.
          </Text>
        </Stack>

        <Button
          fullWidth
          size="md"
          leftSection={<IconBrandGoogle size={18} />}
          onClick={handleGoogleSignIn}
          loading={busy}
        >
          Entrar com Google
        </Button>

        {import.meta.env.DEV && (
          <Box mt="md">
            <Center>
              <Anchor size="xs" c="dimmed" onClick={devHandlers.toggle}>
                Dev: entrar sem OAuth
              </Anchor>
            </Center>
            <Collapse in={devOpen}>
              <Stack gap="sm" mt="sm">
                <TextInput
                  label="Nome"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                />
                <TextInput
                  label="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleMockSignIn()}
                />
                <Button
                  variant="default"
                  fullWidth
                  onClick={handleMockSignIn}
                  disabled={busy || !email || !name}
                >
                  Entrar (mock)
                </Button>
              </Stack>
            </Collapse>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
