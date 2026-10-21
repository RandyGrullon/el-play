// Kit del modo PRO de la app: piezas comunes de todas las pantallas PRO (la misma API que el kit de la web cuando
// tiene sentido). Catálogo con ejemplos: scratchpad/pro-app/base/kit.md. Importa SIEMPRE desde aquí.

// Estructura
export { ModuleHeader, ProSection, ScreenTitle } from './ModuleHeader';
export { StatTile, Delta, GradientCard, type StatTileProps, type DeltaProps, type TileTone } from './StatTile';
export { Chip, ChipButton, ChipRow, TeamChip, useChipInk, type ChipTone } from './Chip';
export { ProSegmented, type SegmentedOption, type ProSegmentedProps } from './ProSegmented';
export { ProTable, ProCellText, sortRows, type CellInfo, type ProColumn, type ProSort, type ProTableProps, type RowTone, type SortDir } from './ProTable';
export { GlossaryButton, GlossarySheet, type GlossaryEntry } from './GlossarySheet';
export { ProNote, MirrorRow, type NoteTone } from './ProNote';
export { ProButton, type ButtonVariant } from './ProButton';
export { useProColors, toneColors, type ProTone } from './theme';

// Gráficas SVG
export { LineChart, type LineChartProps, type LinePoint, type LineSeries } from './LineChart';
export { WinProbChart, type WinProbChartProps, type WinProbMarker, type WinProbPoint } from './WinProbChart';
export { HBarChart, DivergingBar, MirrorBar, type HBarChartProps, type HBarRow } from './Bars';
export { HeatGrid, type HeatCell, type HeatGridProps } from './HeatGrid';
export { Gauge } from './Gauge';
export { FormDots, type GameResult } from './FormDots';
export { StepChart, type StepChartProps, type StepMarker, type StepSeries } from './StepChart';
export { ScatterChart, type ScatterChartProps, type ScatterPoint } from './ScatterChart';
export { ChartHotspot, MarkerBadge, FadeG, useSvgId, useAxisText, middle } from './chart';

// Movimiento
export { CountUp } from './CountUp';
export { Odometer } from './Odometer';
export { LiveDot, UpdatedAgo, type LiveTone } from './LiveDot';
export { GrowBar, useGrow } from './GrowBar';
export { DrawPath, useDraw } from './DrawPath';
export { Enter, Flash, PlusOne, useReorder, type FlashTone } from './Enter';
export { useInView, useElementWidth, useChartBox, useNow, useChanged, useTrend, type InView, type ViewNode } from './hooks';
export { useMotion, useReducedMotion, motionFor, easeOut, MOTION_MS, MOTION_STAGGER, MOTION_EASE, type Motion } from '../../../lib/motion';

// Lógica pura
export { linearScale, extent, niceStep, niceDomain, niceTicks, clamp, type Domain, type LinearScale } from './scale';
export { linePath, areaPath, stepPath, arcPath, polar, polylineLength, stepLength, arcLength, type Point } from './paths';
export { hexToRgb, rgbToHex, mix, withAlpha, luminance, contrastRatio, teamInk, readableInk, heatColor, scaleColor, fraction, HEAT_SCALES, type HeatScale } from './color';
export { fmtSigned, fmtAvg, fmtPercent, toCelsius, toTime, initials, shortName, lastName, agoParts, countdownParts, pad2 } from './format';
export { easeOutCubic, tween, decimalsOf } from './tween';
