import { createFileRoute } from "@tanstack/react-router";
import { AdminAxLabView } from "@/components/AdminAxLabView";

export const Route = createFileRoute("/_authenticated/admin/axlab")({ component: AdminAxLabView });
