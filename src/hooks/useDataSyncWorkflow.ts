import { useEffect, useMemo, useRef, useState } from "react";

import { executeDataSync, proposeSchemaMappings, proposeValueMappings } from "../services/data-sync-agent";
import { localDataSyncAdapter } from "../services/local-data-sync-adapter";
import type { DifferenceResolution, LocalSyncTask, PlatformId, SchemaMappings, SyncContent, SyncDifference, SyncPlatform, SyncSchemaField, SyncSourceId, UploadedSyncSource } from "../types/data-sync";

interface SyncTaskDraft {
  id: string;
  sourceId: PlatformId | null;
  uploadedSource: UploadedSyncSource | null;
  targetId: PlatformId | null;
  mappingSelections: SchemaMappings;
  selectedMappingIds: string[];
  schemaSelectionSubmitted: boolean;
  differenceResolutions: Record<string, DifferenceResolution>;
  activeStep: 1 | 2;
  schemaProposalKey: string | null;
  valueProposalKey: string | null;
}

export interface DataSyncTaskView extends SyncTaskDraft {
  sourceSchema: SyncSchemaField[];
  sourceKey: SyncSourceId | null;
  sourceContent: SyncContent | null;
  targetSchema: SyncSchemaField[];
  schemaMappings: SchemaMappings;
  selectedSchemaMappings: SchemaMappings;
  schemaSelectedCount: number;
  schemaComplete: boolean;
  differences: SyncDifference[];
  unresolvedDecisionCount: number;
  canSubmit: boolean;
  result: LocalSyncTask | null;
}

function createDraft(id: string): SyncTaskDraft {
  return { id, sourceId: null, uploadedSource: null, targetId: null, mappingSelections: {}, selectedMappingIds: [], schemaSelectionSubmitted: false, differenceResolutions: {}, activeStep: 1, schemaProposalKey: null, valueProposalKey: null };
}

function mappingsFor(task: SyncTaskDraft & { targetId: PlatformId }, sourceSchema: SyncSchemaField[], targetSchema: SyncSchemaField[]) {
  const defaults = sourceSchema.map((sourceField) => {
    const id = localDataSyncAdapter.mappingId(task.targetId, sourceField.scope, sourceField.key);
    const targetField = targetSchema.find((field) => field.scope === sourceField.scope && field.key === sourceField.key);
    return [id, { targetFieldKey: targetField?.key ?? sourceField.key, createTargetField: !targetField }];
  });
  return { ...Object.fromEntries(defaults), ...task.mappingSelections } as SchemaMappings;
}

export function useDataSyncWorkflow(spuId: string) {
  const nextTaskId = useRef(2);
  const previousSpuId = useRef(spuId);
  const [platforms, setPlatforms] = useState<SyncPlatform[]>([]);
  const [tasks, setTasks] = useState<SyncTaskDraft[]>([createDraft("sync-draft-1")]);
  const [taskResults, setTaskResults] = useState<Record<string, LocalSyncTask>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightSchemaProposals = useRef(new Set<string>());
  const inFlightValueProposals = useRef(new Set<string>());

  useEffect(() => { void localDataSyncAdapter.getPlatforms().then(setPlatforms); }, []);
  useEffect(() => {
    if (previousSpuId.current === spuId) return;
    previousSpuId.current = spuId;
    nextTaskId.current = 2;
    setTasks([createDraft("sync-draft-1")]);
    setTaskResults({});
  }, [spuId]);

  const taskViews = useMemo<DataSyncTaskView[]>(() => tasks.map((task) => {
    const sourceKey: SyncSourceId | null = task.uploadedSource ? "uploaded-file" : task.sourceId;
    const sourceContent = task.uploadedSource?.content ?? (task.sourceId ? localDataSyncAdapter.getContent(task.sourceId, spuId) : null);
    const sourceSchema = sourceContent ? localDataSyncAdapter.getSchemaForContent(sourceContent) : [];
    const targetSchema = task.targetId ? localDataSyncAdapter.getSchema(task.targetId, spuId) : [];
    const schemaMappings = task.targetId ? mappingsFor({ ...task, targetId: task.targetId }, sourceSchema, targetSchema) : {};
    const selectedSchemaMappings = Object.fromEntries(task.selectedMappingIds
      .filter((id) => schemaMappings[id])
      .map((id) => [id, schemaMappings[id]])) as SchemaMappings;
    const schemaSelectedCount = Object.keys(selectedSchemaMappings).length;
    const schemaComplete = task.schemaSelectionSubmitted && schemaSelectedCount > 0;
    const differences = schemaComplete && sourceKey && sourceContent && task.targetId
      ? localDataSyncAdapter.previewContent(spuId, sourceKey, sourceContent, [task.targetId], selectedSchemaMappings, task.selectedMappingIds)
      : [];
    const unresolvedDecisionCount = differences.filter((difference) => difference.result !== "skipped" && !task.differenceResolutions[difference.id]).length;
    return { ...task, activeStep: schemaComplete ? task.activeStep : 1, sourceKey, sourceContent, sourceSchema, targetSchema, schemaMappings, selectedSchemaMappings, schemaSelectedCount, schemaComplete, differences, unresolvedDecisionCount, canSubmit: schemaComplete && unresolvedDecisionCount === 0, result: taskResults[task.id] ?? null };
  }), [spuId, taskResults, tasks]);

  useEffect(() => {
    tasks.forEach((task) => {
      const sourceKey: SyncSourceId | null = task.uploadedSource ? "uploaded-file" : task.sourceId;
      const sourceContent = task.uploadedSource?.content ?? (task.sourceId ? localDataSyncAdapter.getContent(task.sourceId, spuId) : null);
      if (!sourceKey || !sourceContent || !task.targetId) return;
      const proposalKey = `${spuId}:${sourceKey}:${task.uploadedSource?.id ?? "platform"}:${task.targetId}`;
      const requestKey = `${task.id}:${proposalKey}`;
      if (task.schemaProposalKey === proposalKey || inFlightSchemaProposals.current.has(requestKey)) return;

      inFlightSchemaProposals.current.add(requestKey);
      setTasks((current) => current.map((candidate) => candidate.id === task.id
        ? { ...candidate, schemaProposalKey: proposalKey }
        : candidate));

      const sourceSchema = localDataSyncAdapter.getSchemaForContent(sourceContent);
      const targetSchema = localDataSyncAdapter.getSchema(task.targetId, spuId);
      void proposeSchemaMappings({
        sourceId: sourceKey,
        targetId: task.targetId,
        sourceContent,
      }).then((suggestions) => {
        setTasks((current) => current.map((candidate) => {
          const candidateSourceKey: SyncSourceId | null = candidate.uploadedSource ? "uploaded-file" : candidate.sourceId;
          if (candidate.id !== task.id || candidateSourceKey !== sourceKey || candidate.uploadedSource?.id !== task.uploadedSource?.id || candidate.targetId !== task.targetId) return candidate;
          const nextSelections = { ...candidate.mappingSelections };
          suggestions.forEach((suggestion) => {
            const sourceField = sourceSchema.find((field) => field.key === suggestion.sourceFieldKey && field.scope === suggestion.sourceScope);
            const validTarget = suggestion.createTargetField
              ? suggestion.targetFieldKey === suggestion.sourceFieldKey
              : targetSchema.some((field) => field.key === suggestion.targetFieldKey && field.scope === suggestion.sourceScope);
            if (!sourceField || !validTarget) return;
            const id = localDataSyncAdapter.mappingId(task.targetId!, suggestion.sourceScope, suggestion.sourceFieldKey);
            if (!candidate.schemaSelectionSubmitted && !(id in candidate.mappingSelections)) {
              nextSelections[id] = { targetFieldKey: suggestion.targetFieldKey, createTargetField: suggestion.createTargetField };
            }
          });
          return { ...candidate, mappingSelections: nextSelections };
        }));
      }).catch((error) => {
        console.warn("Schema mapping Agent 调用失败，继续使用本地默认映射。", error);
      }).finally(() => {
        inFlightSchemaProposals.current.delete(requestKey);
      });
    });
  }, [spuId, tasks]);

  useEffect(() => {
    taskViews.forEach((task) => {
      if (!task.schemaComplete || !task.sourceKey || !task.targetId || !task.differences.length) return;
      const mappingSignature = Object.entries(task.selectedSchemaMappings)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, mapping]) => `${id}:${mapping.targetFieldKey}:${mapping.createTargetField}`)
        .join("|");
      const proposalKey = `${spuId}:${task.sourceKey}:${task.uploadedSource?.id ?? "platform"}:${task.targetId}:${mappingSignature}`;
      const requestKey = `${task.id}:${proposalKey}`;
      if (task.valueProposalKey === proposalKey || inFlightValueProposals.current.has(requestKey)) return;

      inFlightValueProposals.current.add(requestKey);
      setTasks((current) => current.map((candidate) => candidate.id === task.id
        ? { ...candidate, valueProposalKey: proposalKey }
        : candidate));
      void proposeValueMappings({
        sourceId: task.sourceKey,
        targetId: task.targetId,
        schemaMappings: task.selectedSchemaMappings,
        differences: task.differences,
      }).then((suggestions) => {
        const validIds = new Set(task.differences.filter((difference) => difference.result !== "skipped").map((difference) => difference.id));
        setTasks((current) => current.map((candidate) => {
          const candidateSourceKey: SyncSourceId | null = candidate.uploadedSource ? "uploaded-file" : candidate.sourceId;
          if (candidate.id !== task.id || candidateSourceKey !== task.sourceKey || candidate.uploadedSource?.id !== task.uploadedSource?.id || candidate.targetId !== task.targetId) return candidate;
          const nextResolutions = { ...candidate.differenceResolutions };
          suggestions.forEach((suggestion) => {
            if (validIds.has(suggestion.differenceId) && !nextResolutions[suggestion.differenceId]) {
              nextResolutions[suggestion.differenceId] = suggestion.resolution;
            }
          });
          return { ...candidate, differenceResolutions: nextResolutions };
        }));
      }).catch((error) => {
        console.warn("Value mapping Agent 调用失败，请手动处理值差异。", error);
      }).finally(() => {
        inFlightValueProposals.current.delete(requestKey);
      });
    });
  }, [taskViews]);

  const clearResult = (taskId: string) => setTaskResults((current) => {
    if (!current[taskId]) return current;
    const next = { ...current };
    delete next[taskId];
    return next;
  });

  const updateTask = (taskId: string, update: (task: SyncTaskDraft) => SyncTaskDraft) => {
    clearResult(taskId);
    setTasks((current) => current.map((task) => task.id === taskId ? update(task) : task));
  };

  const addTask = () => setTasks((current) => [...current, createDraft(`sync-draft-${nextTaskId.current++}`)]);
  const removeTask = (taskId: string) => { setTasks((current) => current.filter((task) => task.id !== taskId)); clearResult(taskId); };

  const selectSource = (taskId: string, sourceId: PlatformId) => updateTask(taskId, (task) => ({
    ...task,
    sourceId,
    uploadedSource: null,
    targetId: task.targetId === sourceId ? null : task.targetId,
    mappingSelections: {}, selectedMappingIds: [], schemaSelectionSubmitted: false, differenceResolutions: {}, activeStep: 1, schemaProposalKey: null, valueProposalKey: null,
  }));

  const selectTarget = (taskId: string, targetId: PlatformId) => updateTask(taskId, (task) => targetId === task.sourceId ? task : ({
    ...task, targetId, mappingSelections: {}, selectedMappingIds: [], schemaSelectionSubmitted: false, differenceResolutions: {}, activeStep: 1, schemaProposalKey: null, valueProposalKey: null,
  }));

  const setRoute = (taskId: string, sourceId: PlatformId, targetId: PlatformId) => {
    if (sourceId === targetId) return;
    updateTask(taskId, (task) => ({
      ...task, sourceId, uploadedSource: null, targetId, mappingSelections: {}, selectedMappingIds: [], schemaSelectionSubmitted: false, differenceResolutions: {}, activeStep: 1, schemaProposalKey: null, valueProposalKey: null,
    }));
  };

  const setUploadedRoute = (taskId: string, uploadedSource: UploadedSyncSource, targetId: PlatformId) => updateTask(taskId, (task) => ({
    ...task, sourceId: null, uploadedSource, targetId, mappingSelections: {}, selectedMappingIds: [], schemaSelectionSubmitted: false, differenceResolutions: {}, activeStep: 1, schemaProposalKey: null, valueProposalKey: null,
  }));

  const updateSchemaMapping = (taskId: string, mappingId: string, targetFieldKey: string, createTargetField: boolean) => updateTask(taskId, (task) => ({
    ...task,
    mappingSelections: { ...task.mappingSelections, [mappingId]: { targetFieldKey, createTargetField } },
    schemaSelectionSubmitted: false, differenceResolutions: {}, activeStep: 1, valueProposalKey: null,
  }));

  const toggleSchemaMapping = (taskId: string, mappingId: string) => updateTask(taskId, (task) => {
    const isSelected = task.selectedMappingIds.includes(mappingId);
    const selectedMappingIds = isSelected
      ? task.selectedMappingIds.filter((id) => id !== mappingId)
      : [...task.selectedMappingIds, mappingId];
    return { ...task, selectedMappingIds, schemaSelectionSubmitted: false, differenceResolutions: {}, activeStep: 1, valueProposalKey: null };
  });

  const advanceToValueMapping = (taskId: string) => updateTask(taskId, (task) => task.selectedMappingIds.length
    ? { ...task, schemaSelectionSubmitted: true, differenceResolutions: {}, activeStep: 2, valueProposalKey: null }
    : task);

  const setActiveStep = (taskId: string, activeStep: 1 | 2) => setTasks((current) => current.map((task) => {
    if (task.id !== taskId) return task;
    if (activeStep === 2 && !task.schemaSelectionSubmitted) return task;
    return { ...task, activeStep };
  }));

  const resolveDifference = (taskId: string, differenceId: string, resolution: DifferenceResolution) => updateTask(taskId, (task) => ({
    ...task, differenceResolutions: { ...task.differenceResolutions, [differenceId]: resolution },
  }));

  const canSubmitAll = taskViews.length > 0 && taskViews.every((task) => task.canSubmit);
  const submitAll = async () => {
    if (!canSubmitAll || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const results = await Promise.all(taskViews.map(async (task) => {
        if (!task.sourceKey || !task.targetId || !task.sourceContent) throw new Error("同步任务缺少来源或目标平台");
        const resolutions = Object.fromEntries(task.differences.map((difference) => [difference.id, difference.result === "skipped" ? "skip" : task.differenceResolutions[difference.id]])) as Record<string, DifferenceResolution>;
        const result = await executeDataSync({
          spuId,
          sourceId: task.sourceKey,
          targetId: task.targetId,
          resolutions,
          schemaMappings: task.selectedSchemaMappings,
          selectedMappingIds: task.selectedMappingIds,
          ...(task.uploadedSource ? { sourceContent: task.sourceContent } : {}),
        });
        return [task.id, result] as const;
      }));
      setTaskResults(Object.fromEntries(results));
    } finally {
      setIsSubmitting(false);
    }
  };

  return { platforms, tasks: taskViews, isSubmitting, canSubmitAll, addTask, removeTask, selectSource, selectTarget, setRoute, setUploadedRoute, updateSchemaMapping, toggleSchemaMapping, advanceToValueMapping, setActiveStep, resolveDifference, submitAll };
}
