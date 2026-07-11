/**
 * 首页 Service - 处理 B10 计算和同步
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';
import {
  targetB10,
  targetB10WithoutMargin,
  weibullEta,
  failureRate,
  calcMtbf,
} from '../calculator.js';

export class HomeService extends BaseService {
  /**
   * 更新首页计算参数
   */
  async updateHomeCalc(modelId, homeCalc) {
    // 校验
    this.validatePositive(homeCalc.warrantyYears, '质保期');
    this.validatePositive(homeCalc.hoursPerYear, '年使用时长');
    this.validatePositive(homeCalc.allowFailRate, '允许失效率');
    this.validatePositive(homeCalc.beta, '形状参数β');
    if (homeCalc.safetyMargin < 0) {
      throw new Error('安全余量不能为负数');
    }

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    // 不可变更新
    const newHomeCalc = { ...model.homeCalc, ...homeCalc };
    const newModel = {
      ...model,
      homeCalc: newHomeCalc,
    };

    await this.saveModel(newModel);

    // 计算 B10 并发送事件
    const b10 = this.calculateB10(newHomeCalc);
    this.emit(Events.HOME_B10_CHANGED, {
      modelId,
      b10: b10.withMargin,
      homeCalc: newHomeCalc,
    });

    return { model: newModel, b10 };
  }

  /**
   * 计算 B10 相关指标
   */
  calculateB10(homeCalc) {
    const { warrantyYears, hoursPerYear, allowFailRate, beta, safetyMargin, time } = homeCalc;

    if (warrantyYears <= 0 || hoursPerYear <= 0 || allowFailRate <= 0 || beta <= 0) {
      return {
        tw: 0,
        withMargin: 0,
        withoutMargin: 0,
        eta: 0,
        mtbf: 0,
        reliabilityT: 0,
        failureT: 0,
      };
    }

    const tw = warrantyYears * hoursPerYear;
    const fw = allowFailRate / 100;
    const margin = safetyMargin / 100;

    const withMargin = targetB10(tw, fw, beta, margin);
    const withoutMargin = targetB10WithoutMargin(tw, fw, beta);
    const eta = weibullEta(withMargin, beta);
    const mtbf = calcMtbf(eta, beta);
    const failureT = failureRate(time, withMargin, beta);
    const reliabilityT = 1 - failureT;

    return {
      tw,
      withMargin,
      withoutMargin,
      eta,
      mtbf,
      reliabilityT,
      failureT,
    };
  }

  /**
   * 同步 B10 到预测模块
   */
  async syncB10ToPrediction(modelId, b10) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    // 不可变更新预测模块的 targetB10
    const prediction = model.modules?.prediction || {};
    const allocation = prediction.allocation || {};
    const newAllocation = { ...allocation, targetB10: b10 };
    const newPrediction = { ...prediction, allocation: newAllocation };
    const newModules = { ...model.modules, prediction: newPrediction };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.PREDICTION_TARGET_CHANGED, {
      modelId,
      targetB10: b10,
    });

    return newModel;
  }
}
