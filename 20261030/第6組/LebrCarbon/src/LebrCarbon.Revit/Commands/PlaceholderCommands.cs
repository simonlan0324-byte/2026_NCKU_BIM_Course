using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace LebrCarbon.Revit.Commands;

/// <summary>尚未實作的按鈕，先讓功能區完整出現，之後逐一替換。</summary>
public abstract class PlaceholderCommand : IExternalCommand
{
    protected abstract string Feature { get; }

    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        TaskDialog.Show("LEBR", $"「{Feature}」將在後續階段實作。");
        return Result.Succeeded;
    }
}

[Transaction(TransactionMode.ReadOnly)]
public sealed class OpenPaneCommand : PlaceholderCommand { protected override string Feature => "停駐面板（6.2 節）"; }

[Transaction(TransactionMode.Manual)]
public sealed class HotspotColorCommand : PlaceholderCommand { protected override string Feature => "F8 3D 熱點著色"; }

[Transaction(TransactionMode.Manual)]
public sealed class ClearColorCommand : PlaceholderCommand { protected override string Feature => "清除著色"; }

[Transaction(TransactionMode.ReadOnly)]
public sealed class ExportReportCommand : PlaceholderCommand { protected override string Feature => "F10 報表輸出"; }

[Transaction(TransactionMode.ReadOnly)]
public sealed class FactorLibraryCommand : PlaceholderCommand { protected override string Feature => "F11 係數庫管理"; }
