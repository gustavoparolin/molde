import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconPlus, IconTrash, IconInbox } from "@tabler/icons-react";
import { useItemsStore, type Item } from "../store/itemsStore";

// Reference page for the `Item` slice: list + create/edit (modal) + delete. This is the
// estética baseline every Molde app starts from — restyle it to match .brief/inspiration/.

export function ItemsPage() {
  const { items, loading, load, create, update, remove } = useItemsStore();
  const [opened, modal] = useDisclosure(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setBody("");
    modal.open();
  }

  function openEdit(item: Item) {
    setEditing(item);
    setTitle(item.title);
    setBody(item.body ?? "");
    modal.open();
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await update(editing.id, { title, body });
      } else {
        await create({ title, body });
      }
      modal.close();
    } catch {
      notifications.show({ color: "red", message: "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: Item) {
    try {
      await remove(item.id);
    } catch {
      notifications.show({ color: "red", message: "Não foi possível excluir." });
    }
  }

  return (
    <Container size="sm" py="md">
      <Group justify="space-between" mb="lg">
        <Title order={3}>Itens</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Novo item
        </Button>
      </Group>

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="brand" />
        </Group>
      ) : items.length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap="xs">
            <IconInbox size={40} opacity={0.4} />
            <Text c="dimmed">Nenhum item ainda. Crie o primeiro.</Text>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Novo item
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {items.map((item) => (
            <Card key={item.id} withBorder radius="md" p="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>
                    {item.title}
                  </Text>
                  {item.body && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {item.body}
                    </Text>
                  )}
                </Stack>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon variant="subtle" color="gray" onClick={() => openEdit(item)}>
                    <IconPencil size={18} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(item)}>
                    <IconTrash size={18} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal opened={opened} onClose={modal.close} title={editing ? "Editar item" : "Novo item"} centered>
        <Stack>
          <TextInput
            label="Título"
            placeholder="Título do item"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            data-autofocus
          />
          <Textarea
            label="Descrição"
            placeholder="Opcional"
            autosize
            minRows={3}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={modal.close}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!title.trim()}>
              Salvar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
