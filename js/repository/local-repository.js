/**
 * 本地数据仓库 - 封装 localStorage/IndexedDB 读写
 * 与现有 store.js 的数据结构完全兼容
 */
import { getState, setState, persistState } from '../store.js';

export class LocalRepository {
  /**
   * 获取全局状态（包含所有项目、产品、型号）
   */
  getState() {
    return getState();
  }

  /**
   * 获取当前型号
   */
  getCurrentModel() {
    const state = this.getState();
    return state?.currentModel || null;
  }

  /**
   * 获取指定型号的完整数据
   */
  getModel(modelId) {
    const state = this.getState();
    if (!state?.projects) return null;

    for (const project of state.projects) {
      if (project.products) {
        for (const product of project.products) {
          if (product.models) {
            const model = product.models.find(m => m.id === modelId);
            if (model) return model;
          }
        }
      }
    }
    return null;
  }

  /**
   * 保存型号数据（深拷贝后持久化）
   */
  async saveModel(model) {
    if (!model?.id) throw new Error('saveModel: model.id 不能为空');

    const state = this.getState();
    if (!state?.projects) throw new Error('saveModel: 项目数据未初始化');

    // 找到并更新型号（不可变方式）
    let updated = false;
    const newProjects = state.projects.map(project => {
      if (!project.products) return project;
      const newProducts = project.products.map(product => {
        if (!product.models) return product;
        const modelIndex = product.models.findIndex(m => m.id === model.id);
        if (modelIndex >= 0) {
          updated = true;
          const newModels = [...product.models];
          newModels[modelIndex] = { ...model };
          return { ...product, models: newModels };
        }
        return product;
      });
      return { ...project, products: newProducts };
    });

    if (!updated) throw new Error(`saveModel: 未找到型号 ${model.id}`);

    // 更新状态并持久化
    const newState = { ...state, projects: newProjects };
    setState(newState);
    persistState();

    return model;
  }

  /**
   * 获取所有型号列表
   */
  getAllModels() {
    const state = this.getState();
    const models = [];
    if (state?.projects) {
      for (const project of state.projects) {
        if (project.products) {
          for (const product of project.products) {
            if (product.models) {
              models.push(...product.models.map(m => ({
                ...m,
                productName: product.name,
                projectName: project.name,
              })));
            }
          }
        }
      }
    }
    return models;
  }

  /**
   * 删除指定型号
   */
  async deleteModel(modelId) {
    const state = this.getState();
    if (!state?.projects) throw new Error('deleteModel: 项目数据未初始化');

    let updated = false;
    const newProjects = state.projects.map(project => {
      if (!project.products) return project;
      const newProducts = project.products.map(product => {
        if (!product.models) return product;
        const newModels = product.models.filter(m => m.id !== modelId);
        if (newModels.length !== product.models.length) {
          updated = true;
          return { ...product, models: newModels };
        }
        return product;
      });
      return { ...project, products: newProducts };
    });

    if (!updated) throw new Error(`deleteModel: 未找到型号 ${modelId}`);

    const newState = { ...state, projects: newProjects };
    setState(newState);
    persistState();

    return true;
  }
}

export const localRepository = new LocalRepository();
