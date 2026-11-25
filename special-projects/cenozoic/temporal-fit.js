import {mid} from './models.js?v=20261120b';

const elapsed = age => 66 - age;

function leastSquares(points, transform) {
  const samples = points.map(point => ({x:transform(point.x), y:point.y}));
  const meanX = samples.reduce((total, {x}) => total + x, 0) / samples.length;
  const meanY = samples.reduce((total, {y}) => total + y, 0) / samples.length;
  let square = 0, cross = 0;
  for (const {x,y} of samples) {
    square += (x - meanX) ** 2;
    cross += (x - meanX) * (y - meanY);
  }
  if (!(square > 0)) throw new Error('Time fitting needs distinct geological ages');
  const slope = cross / square;
  const intercept = meanY - slope * meanX;
  const predict = x => intercept + slope * transform(x);
  const {mae,rmse,mse} = residualMetrics(points.map(({x,y}) => y - predict(x)));
  return {slope,intercept,predict,mae,rmse,mse};
}

export function residualMetrics(errors) {
  if (!errors.length) return {mae:null,rmse:null,mse:null,count:0};
  let squares = 0, absolute = 0;
  for (const error of errors) {
    squares += error * error;
    absolute += Math.abs(error);
  }
  const mse = squares / errors.length;
  return {mae:absolute / errors.length,rmse:Math.sqrt(mse),mse,count:errors.length};
}

export function fitTemporalPairs(pairs) {
  const points = pairs.map(pair => ({x:elapsed(mid(pair.geo)),y:pair.history.year}));
  if (points.length < 3 || points.some(({x,y}) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error('Temporal fitting needs at least three complete chronological pairs');
  }
  const minX = Math.min(...points.map(({x}) => x));
  const maxX = Math.max(...points.map(({x}) => x));
  const span = maxX - minX;
  const linear = leastSquares(points, x => x);
  // Search a positive characteristic age on a logarithmic scale, then refine
  // the best grid neighborhood. All residuals are measured in historical years.
  const minimum = Math.log(span / 1e4);
  const maximum = Math.log(span * 1e4);
  const count = 80;
  const step = (maximum - minimum) / count;
  const at = logTau => {
    const tau = Math.exp(logTau);
    return {tau,...leastSquares(points, x => Math.log1p(x / tau))};
  };
  const grid = Array.from({length:count+1}, (_,i) => at(minimum + i*step));
  const best = grid.reduce((winner, value, i) => value.mse < grid[winner].mse ? i : winner,0);
  let left = minimum + Math.max(0,best-1)*step;
  let right = minimum + Math.min(count,best+1)*step;
  for (let n=0; n<55; n++) {
    const a = left + (right-left)/3;
    const b = right - (right-left)/3;
    if (at(a).mse < at(b).mse) right = b;
    else left = a;
  }
  let log = at((left+right)/2);
  if (grid[best].mse < log.mse) log=grid[best];
  return {linear,log,minX,maxX,count:points.length,searchBounds:[Math.exp(minimum),Math.exp(maximum)]};
}

export function fittedProjection(fits, model, age) {
  return fits[model].predict(elapsed(age));
}

export function inferredAge(fits, model, year, offset, older = 66, younger = 5.333) {
  const from = elapsed(older), to = elapsed(younger);
  let x;
  if (model === 'fixed') x = (year - offset) / 100;
  else {
    const fit = fits[model];
    if (fit.slope === 0) return null;
    const normalized = (year - fit.intercept) / fit.slope;
    x = model === 'linear' ? normalized : fit.tau * Math.expm1(normalized);
  }
  // Report an inverse comparison only within the selected age window.
  if (!Number.isFinite(x) || x < from - 1e-9 || x > to + 1e-9) return null;
  return 66 - Math.max(from,Math.min(to,x));
}

export function describeFit(fits) {
  const {slope,intercept,mae,rmse} = fits.linear;
  const log = fits.log;
  return {
    source:'160 paired fossil-age midpoints and astronomical historical years',
    objective:'Unweighted squared errors in astronomical historical years',
    pairCount:fits.count,
    linear:{intercept,slope,mae,rmse},
    logarithmic:{intercept:log.intercept,slope:log.slope,tauMa:log.tau,mae:log.mae,rmse:log.rmse},
    tauSearchBoundsMa:fits.searchBounds
  };
}
