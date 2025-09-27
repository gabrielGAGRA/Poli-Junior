'EXPORTAÇÃO DIRETO

    Sheets("VDC").Select

    Set DataRange = Range(Cells(23, 2), Cells(23, UltCol))
    DataRange.Select
    Application.CutCopyMode = False
    Selection.Copy
    Sheets("ROF_CNTR").Select
    Range("C101").Select
    Selection.PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
        :=False, Transpose:=False
        
    Range(ColLet & "101").Formula = "=IFERROR(" & ColLet & "102*" & ColLet & "103,0)"
    'Range(Cells(88, UltCol), Cells(88, 38)).FillRight

    Range("C102").Formula = "=IFERROR(C101/C103,0)"
    Range(Cells(91, 3), Cells(91, UltCol)).FillRight

    Range("C103").Formula = "=IFERROR(INT(VDC!C25)*C54,0)"
    Range(Cells(92, 3), Cells(92, UltCol)).FillRight
    
'Formatação
    Range(Cells(63, UltCol + 1), Cells(65, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With
    
    Range(Cells(68, UltCol + 1), Cells(69, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With
  
  
    Range(Cells(82, UltCol + 1), Cells(83, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With
    
    Range(Cells(86, UltCol + 1), Cells(87, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With

    Range(Cells(91, UltCol + 1), Cells(93, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With

    Range(Cells(103, UltCol + 1), Cells(105, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With
  
    Range(Cells(122, UltCol + 1), Cells(123, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With
    
    Range(Cells(126, UltCol + 1), Cells(127, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With

    Range(Cells(131, UltCol + 1), Cells(133, UltCol + 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorAccent1
        .TintAndShade = 0.799981688894314
        .PatternTintAndShade = 0
    End With
     
' Mudando a cor do mês atual automaticamente
    Sheets("ROFO_CNTR").Select
    Cells(14, UltCol).Select
    With Selection.Interior 'Cor background
        .Pattern = xlSolid
        .Color = RGB(172, 185, 202)
    End With
    With Selection.Font 'Cor da fonte
        .Color = RGB(0, 0, 0)
    End With
        
    Cells(15, UltCol).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(217, 225, 242)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
        
    Cells(53, UltCol).Select
    With Selection.Interior
        .Pattern = xlSolid
        .Color = RGB(172, 185, 202)
    End With
    With Selection.Font
        .Color = RGB(0, 0, 0)
    End With
        
    Cells(54, UltCol).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(208, 206, 206)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
        
    Cells(57, UltCol).Select
    With Selection.Interior
        .Pattern = xlSolid
        .Color = RGB(172, 185, 202)
    End With
    With Selection.Font
        .Color = RGB(0, 0, 0)
    End With
        
    Cells(58, UltCol).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(217, 225, 242)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
        
    Cells(97, UltCol).Select
    With Selection.Interior
        .Pattern = xlSolid
        .Color = RGB(172, 185, 202)
    End With
    With Selection.Font
        .Color = RGB(0, 0, 0)
    End With
        
    Cells(98, UltCol).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(217, 225, 242)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
    
' Mudando a cor do mês passado automaticamente
    Cells(14, UltCol - 1).Select
    With Selection.Interior 'Cor background
        .Pattern = xlSolid
        .Color = RGB(68, 84, 106)
    End With
    With Selection.Font 'Cor da fonte
        .Color = RGB(255, 255, 255)
    End With
        
    Cells(15, UltCol - 1).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(208, 206, 206)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
        
    Cells(53, UltCol - 1).Select
    With Selection.Interior
        .Pattern = xlSolid
        .Color = RGB(68, 84, 106)
    End With
    With Selection.Font
        .Color = RGB(255, 255, 255)
    End With
        
    Cells(54, UltCol - 1).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(208, 206, 206)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
        
    Cells(57, UltCol - 1).Select
    With Selection.Interior
        .Pattern = xlSolid
        .Color = RGB(68, 84, 106)
    End With
    With Selection.Font
        .Color = RGB(255, 255, 255)
    End With
        
    Cells(58, UltCol - 1).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(208, 206, 206)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
        
    Cells(97, UltCol - 1).Select
    With Selection.Interior
        .Pattern = xlSolid
        .Color = RGB(68, 84, 106)
    End With
    With Selection.Font
        .Color = RGB(255, 255, 255)
    End With
        
    Cells(98, UltCol - 1).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(208, 206, 206)
    End With
    With Selection.Font
        .Color = RGB(51, 63, 79)
    End With
    
' Mudando a cor das células para branco do mês anterior e atual
    Range(Cells(61, UltCol - 1), Cells(93, UltCol - 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(255, 255, 255)
    End With
    
    Range(Cells(61, UltCol), Cells(93, UltCol)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(255, 255, 255)
    End With

    Range(Cells(101, UltCol - 1), Cells(133, UltCol - 1)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(255, 255, 255)
    End With

    Range(Cells(101, UltCol), Cells(133, UltCol)).Select
    With Selection.Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .Color = RGB(255, 255, 255)
    End With

End Sub