/**
 * 故障树分析 Service - 处理 FTA 树管理
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';

export class FtaService extends BaseService {
  async addTree(modelId, tree) {
    if (!tree.name) throw new Error('故障树名称不能为空');

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const fta = model.modules?.fta || { trees: [], activeTreeId: null };
    const trees = fta.trees || [];
    const newTree = {
      id: crypto.randomUUID?.() ?? `fta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...tree,
      nodes: tree.nodes || [],
      createdAt: new Date().toISOString(),
    };
    const newTrees = [...trees, newTree];
    const newFta = { ...fta, trees: newTrees, activeTreeId: newTree.id };
    const newModules = { ...model.modules, fta: newFta };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('fta:tree-added', { modelId, tree: newTree });
    return { model: newModel, tree: newTree };
  }

  async removeTree(modelId, treeId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const fta = model.modules?.fta || { trees: [] };
    const trees = fta.trees || [];
    const newTrees = trees.filter(t => t.id !== treeId);
    if (newTrees.length === trees.length) throw new Error(`未找到故障树 ${treeId}`);

    const newFta = { ...fta, trees: newTrees };
    if (fta.activeTreeId === treeId) {
      newFta.activeTreeId = newTrees.length > 0 ? newTrees[0].id : null;
    }
    const newModules = { ...model.modules, fta: newFta };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('fta:tree-removed', { modelId, treeId });
    return newModel;
  }

  async updateTree(modelId, treeId, updates) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const fta = model.modules?.fta || { trees: [] };
    const trees = fta.trees || [];
    const idx = trees.findIndex(t => t.id === treeId);
    if (idx < 0) throw new Error(`未找到故障树 ${treeId}`);

    const newTrees = [...trees];
    newTrees[idx] = { ...trees[idx], ...updates };
    const newFta = { ...fta, trees: newTrees };
    const newModules = { ...model.modules, fta: newFta };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('fta:tree-updated', { modelId, tree: newTrees[idx] });
    return { model: newModel, tree: newTrees[idx] };
  }

  async setActiveTree(modelId, treeId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const fta = model.modules?.fta || {};
    const newFta = { ...fta, activeTreeId: treeId };
    const newModules = { ...model.modules, fta: newFta };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('fta:active-tree-changed', { modelId, treeId });
    return newModel;
  }
}
