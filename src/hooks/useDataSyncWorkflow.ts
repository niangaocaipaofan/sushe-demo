import { useEffect, useMemo, useState } from "react";

import { localDataSyncAdapter } from "../services/local-data-sync-adapter";
import type { DataScopeId, DifferenceResolution, LocalSyncTask, PlatformId, SyncPlatform } from "../types/data-sync";

function toggleSet<T>(current: Set<T>, id: T) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function useDataSyncWorkflow() {
  const [platforms, setPlatforms] = useState<SyncPlatform[]>([]);
  const [sourceIds, setSourceIds] = useState<Set<PlatformId>>(new Set(["wanzhen", "jushuitan"]));
  const [targetIds, setTargetIds] = useState<Set<PlatformId>>(new Set(["ecpro"]));
  const [scopeIds, setScopeIds] = useState<Set<DataScopeId>>(new Set(["product", "sku", "price", "content", "media", "attributes"]));
  const [isCreating, setIsCreating] = useState(false);
  const [createdTask, setCreatedTask] = useState<LocalSyncTask | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [differenceResolutions, setDifferenceResolutions] = useState<Record<string, DifferenceResolution>>({});

  useEffect(() => {
    void localDataSyncAdapter.getPlatforms().then(setPlatforms);
  }, []);

  const sourceList = useMemo(() => Array.from(sourceIds), [sourceIds]);
  const targetList = useMemo(() => Array.from(targetIds), [targetIds]);
  const scopeList = useMemo(() => Array.from(scopeIds), [scopeIds]);
  const scopes = useMemo(() => localDataSyncAdapter.getScopes(sourceList), [sourceList]);
  const differences = useMemo(
    () => localDataSyncAdapter.preview(sourceList, targetList, scopeList),
    [scopeList, sourceList, targetList],
  );
  const unresolvedDecisionCount = differences.filter(
    (difference) => difference.result !== "skipped" && !differenceResolutions[difference.id],
  ).length;

  const resolveDifference = (id: string, resolution: DifferenceResolution) => {
    setCreatedTask(null);
    setDifferenceResolutions((current) => ({ ...current, [id]: resolution }));
  };
  const toggleSource = (id: PlatformId) => {
    setCreatedTask(null);
    const platformLabel = platforms.find((platform) => platform.id === id)?.label ?? id;
    setSelectionNotice(targetIds.has(id) ? `已将 ${platformLabel} 从同步目标移出，并设为数据来源` : null);
    setSourceIds((current) => toggleSet(current, id));
    setTargetIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const toggleTarget = (id: PlatformId) => {
    setCreatedTask(null);
    const platformLabel = platforms.find((platform) => platform.id === id)?.label ?? id;
    setSelectionNotice(sourceIds.has(id) ? `已将 ${platformLabel} 从数据来源移出，并设为同步目标` : null);
    setTargetIds((current) => toggleSet(current, id));
    setSourceIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const toggleScope = (id: DataScopeId) => {
    setCreatedTask(null);
    setScopeIds((current) => toggleSet(current, id));
  };

  const createTask = async () => {
    if (!sourceIds.size || !targetIds.size || !scopeIds.size || unresolvedDecisionCount) return;
    const resolutions = Object.fromEntries(differences.map((difference) => [
      difference.id,
      difference.result === "skipped" ? "skip" : differenceResolutions[difference.id],
    ])) as Record<string, DifferenceResolution>;
    setIsCreating(true);
    try {
      setCreatedTask(await localDataSyncAdapter.createTask(sourceList, targetList, scopeList, resolutions));
    } finally {
      setIsCreating(false);
    }
  };

  return {
    platforms,
    sourceIds,
    targetIds,
    scopes,
    scopeIds,
    differences,
    differenceResolutions,
    unresolvedDecisionCount,
    isCreating,
    createdTask,
    selectionNotice,
    canCreate: sourceIds.size > 0 && targetIds.size > 0 && scopeIds.size > 0 && unresolvedDecisionCount === 0,
    toggleSource,
    toggleTarget,
    toggleScope,
    resolveDifference,
    createTask,
  };
}
