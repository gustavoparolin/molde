import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Center, Loader, Stack, Text } from "@mantine/core";
import { handleOAuthCallback } from "./authCallbackHandler";

// Lands here after Google redirects with ?token=<jwt> (success) or ?error=... (failure).
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const err = params.get("error");

    if (token) {
      handleOAuthCallback(token);
      navigate("/", { replace: true });
      return;
    }
    if (err) setError(true);
  }, [navigate]);

  return (
    <Center mih="100dvh">
      {error ? (
        <Stack align="center" gap="sm">
          <Text c="red">Não foi possível concluir o login.</Text>
          <Button variant="default" onClick={() => navigate("/", { replace: true })}>
            Voltar
          </Button>
        </Stack>
      ) : (
        <Box ta="center">
          <Loader color="brand" />
          <Text mt="sm" c="dimmed" size="sm">
            Entrando…
          </Text>
        </Box>
      )}
    </Center>
  );
}
