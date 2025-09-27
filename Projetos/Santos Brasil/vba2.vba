' Ativar o Option Explicit no topo do módulo é uma boa prática obrigatória.
Option Explicit

'====================================================================================
'   SCRIPT PARA ATUALIZAÇÃO AUTOMÁTICA DA PLANILHA ROFO_CNTR
'====================================================================================

' Função Auxiliar para encontrar a coluna na VDC baseada no Ano e Mês
Function FindVDCColumn(ws As Worksheet, yr As Integer, mn As Integer) As Long
    Dim col As Long
    Dim lastCol As Long
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    
    For col = 1 To lastCol
        If IsDate(ws.Cells(1, col).Value) Then
            If Year(ws.Cells(1, col).Value) = yr And Month(ws.Cells(1, col).Value) = mn Then
                FindVDCColumn = col
                Exit Function
            End If
        End If
    Next col
    FindVDCColumn = 0
End Function

' Função de mapeamento VDC para ROFO
Function GetRofoMapping(vdcSeriesName As String) As String

    Static dict As Object
    
    If dict Is Nothing Then
        Set dict = CreateObject("Scripting.Dictionary")
        
        ' --- MAPEAMENTO PROVISÓRIO - DE: VDC | PARA: ROFO_CNTR ---
        
        ' Mapeamento de #CNTRs (Contagens de Contêiner)
        dict.Add "cd_fcl_H_Cont_mes", "FCL H #CNTRs"
        dict.Add "cd_fcl_P_Cont_mes", "FCL P #CNTRs"
        dict.Add "cd_lcl_H_Cont_mes", "LCL H #CNTRs"
        dict.Add "cd_lcl_P_Cont_mes", "LCL P #CNTRs"
        dict.Add "cd_fcl_P_Cont_CS_mes", "FCL P #CNTRs (Carga Solta)"
        dict.Add "cd_tbl_publica_H_Cont_mes", "FCL H #CNTRs Tabela Pública"
        dict.Add "cd_tbl_publica_P_Cont_mes", "FCL P #CNTRs Tabela Pública"
        dict.Add "cd_Exportacao_cont", "Exportação #CNTRs (emb. CH LC)"
        
        ' Mapeamento de #BLs (Contagens de Bill of Lading)
        dict.Add "cd_lcl_H_bl", "LCL H #BLs"
        dict.Add "cd_lcl_P_bl", "LCL P #BLs"
        
        ' Mapeamento de ROB (Receita Bruta)
        dict.Add "cd_fcl_H_mes", "FCL H ROB (R$)"
        dict.Add "cd_fcl_P_mes", "FCL P ROB (R$)"
        dict.Add "cd_lcl_H_mes", "LCL H ROB (R$)"
        dict.Add "cd_lcl_P_mes", "LCL P ROB (R$)"
        dict.Add "cd_tbl_publica_H_mes", "FCL H ROB (R$) Tabela Pública"
        dict.Add "cd_tbl_publica_P_mes", "FCL P ROB (R$) Tabela Pública"
        dict.Add "cd_Importacao", "Importação ROB (R$)" ' Suposição: cd_Importacao sem sufixo é a receita
        
        ' Outros
        dict.Add "cd_Exportacao", "Exportação"
        dict.Add "cd_Ferrovia", "Ferrovia"
        
    End If
    
    If dict.Exists(vdcSeriesName) Then
        GetRofoMapping = dict(vdcSeriesName)
    Else
        GetRofoMapping = "NOT_FOUND"
    End If

End Function

Sub AtualizarROFO_Completo()

    ' --- 0. CONFIGURAÇÃO INICIAL ---
    On Error GoTo ErrorHandler ' Adiciona um manipulador de erros básico
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    Dim wsVDC As Worksheet, wsROFO As Worksheet
    Set wsVDC = ThisWorkbook.Sheets("VDC")
    Set wsROFO = ThisWorkbook.Sheets("ROFO_CNTR")

    ' Encontra a última coluna com dados na ROFO para tornar o script dinâmico aos meses
    Dim lastColROFO As Long
    lastColROFO = wsROFO.Cells(5, wsROFO.Columns.Count).End(xlToLeft).Column ' Mês está na linha 5

    ' CORREÇÃO: Limpa apenas os dados (a partir da linha 7), preservando cabeçalhos e rótulos
    ' Limpa apenas as colunas de dados (C em diante) e apenas as linhas de dados (7 em diante)
    If lastColROFO >= 3 Then ' Só limpa se houver colunas de dados
        wsROFO.Range(wsROFO.Cells(7, 3), wsROFO.Cells(100, lastColROFO)).ClearContents
    End If

    ' --- PASSE 1: TRANSFERÊNCIA DE DADOS BASE (CÓPIA DIRETA DA VDC) ---
    Dim lastRowVDC As Long
    lastRowVDC = wsVDC.Cells(wsVDC.Rows.Count, "A").End(xlUp).Row ' Nomes VDC na Coluna A

    Dim i As Long, j As Long
    For i = 2 To lastRowVDC
        Dim sourceName As String: sourceName = wsVDC.Cells(i, "A").Value
        Dim targetName As String: targetName = GetRofoMapping(sourceName)
        
        If targetName <> "NOT_FOUND" Then
            Dim targetRow As Variant: targetRow = Application.Match(targetName, wsROFO.Columns("B"), 0)

            If Not IsError(targetRow) Then
                For j = 3 To lastColROFO ' Loop começa na coluna C
                    Dim currentYear As Integer: currentYear = wsROFO.Cells(4, j).Value ' Ano na linha 4
                    Dim currentMonth As Integer: currentMonth = wsROFO.Cells(5, j).Value ' Mês na linha 5
                    
                    Dim sourceCol As Long: sourceCol = FindVDCColumn(wsVDC, currentYear, currentMonth)
                    
                    If sourceCol > 0 Then
                        wsROFO.Cells(targetRow, j).Value = wsVDC.Cells(i, sourceCol).Value
                    End If
                Next j
            End If
        End If
    Next i

    ' --- PASSE 2: CÁLCULOS DE AGREGAÇÃO (SOMAS TOTAIS) ---
    For j = 3 To lastColROFO ' Loop em cada coluna de mês na ROFO
        
        ' --- LÓGICA: Vol total (Linha 7) ---
        ' RACIOCÍNIO: O volume total de contêineres é a soma de todas as linhas de contagem de #CNTRs.
        ' Isso nos dá o denominador para os cálculos de market share (%CNTRs) e Ticket Médio geral.
        wsROFO.Cells(7, j).Value = wsROFO.Cells(14, j).Value + wsROFO.Cells(15, j).Value + wsROFO.Cells(16, j).Value + _
                                  wsROFO.Cells(17, j).Value + wsROFO.Cells(18, j).Value + wsROFO.Cells(19, j).Value + _
                                  wsROFO.Cells(20, j).Value + wsROFO.Cells(57, j).Value 'Incluindo Exportação
        
        ' --- LÓGICA: ROB total (Linha 8) ---
        ' RACIOCÍNIO: A receita total é a soma de todas as linhas de ROB (R$).
        ' Essencial para o cálculo do Ticket Médio geral e do mix de receita (%ROB).
        wsROFO.Cells(8, j).Value = wsROFO.Cells(12, j).Value + wsROFO.Cells(32, j).Value + wsROFO.Cells(33, j).Value + _
                                  wsROFO.Cells(34, j).Value + wsROFO.Cells(35, j).Value + wsROFO.Cells(36, j).Value + _
                                  wsROFO.Cells(37, j).Value
    Next j

    ' --- PASSE 3: CÁLCULOS DE MÉTRICAS DERIVADAS (DIVISÕES E PERCENTUAIS) ---
    For j = 3 To lastColROFO ' Loop final em cada coluna para os cálculos finais
    
        Dim volTotal As Double: volTotal = wsROFO.Cells(7, j).Value
        Dim robTotal As Double: robTotal = wsROFO.Cells(8, j).Value

        ' --- LÓGICA: Ticket Médio Geral (Linha 9) ---
        ' RACIOCÍNIO: Receita total dividida pelo volume total de contêineres.
        ' Mede o valor médio por contêiner movimentado.
        If volTotal <> 0 Then ' Proteção contra erro de divisão por zero
            wsROFO.Cells(9, j).Value = robTotal / volTotal
        End If
        
        ' --- LÓGICA: Percentuais de Volume (%CNTRs) (Linhas 25-30) ---
        ' RACIOCÍNIO: Representatividade de cada linha de negócio no volume total de contêineres.
        If volTotal <> 0 Then
            wsROFO.Cells(25, j).Value = wsROFO.Cells(14, j).Value / volTotal ' FCL H %CNTRs
            wsROFO.Cells(26, j).Value = wsROFO.Cells(15, j).Value / volTotal ' FCL H %CNTRs Tabela Pública
            wsROFO.Cells(27, j).Value = wsROFO.Cells(16, j).Value / volTotal ' FCL P %CNTRs
            wsROFO.Cells(28, j).Value = wsROFO.Cells(17, j).Value / volTotal ' FCL P %CNTRs Tabela Pública
            wsROFO.Cells(29, j).Value = wsROFO.Cells(19, j).Value / volTotal ' LCL H %CNTRs
            wsROFO.Cells(30, j).Value = wsROFO.Cells(20, j).Value / volTotal ' LCL P %CNTRs
        End If
        
        ' --- LÓGICA: Percentuais de Receita (%ROB) (Linhas 39-44) ---
        ' RACIOCÍNIO: Representatividade de cada linha de negócio na receita total.
        If robTotal <> 0 Then
            wsROFO.Cells(39, j).Value = wsROFO.Cells(32, j).Value / robTotal ' FCL H %ROB
            wsROFO.Cells(40, j).Value = wsROFO.Cells(33, j).Value / robTotal ' FCL H %ROB Tabela Pública
            wsROFO.Cells(41, j).Value = wsROFO.Cells(34, j).Value / robTotal ' FCL P %ROB
            wsROFO.Cells(42, j).Value = wsROFO.Cells(35, j).Value / robTotal ' FCL P %ROB Tabela Pública
            wsROFO.Cells(43, j).Value = wsROFO.Cells(36, j).Value / robTotal ' LCL H %ROB
            wsROFO.Cells(44, j).Value = wsROFO.Cells(37, j).Value / robTotal ' LCL P %ROB
        End If
        
        ' --- LÓGICA: Tickets Médios Específicos (Linhas 46 em diante) ---
        ' RACIOCÍNIO: Calcula o TM para cada linha de negócio, dividindo o ROB específico pelo #CNTRs específico.
        If wsROFO.Cells(14, j).Value <> 0 Then wsROFO.Cells(46, j).Value = wsROFO.Cells(32, j).Value / wsROFO.Cells(14, j).Value
        If wsROFO.Cells(15, j).Value <> 0 Then wsROFO.Cells(47, j).Value = wsROFO.Cells(33, j).Value / wsROFO.Cells(15, j).Value
        If wsROFO.Cells(16, j).Value <> 0 Then wsROFO.Cells(48, j).Value = wsROFO.Cells(34, j).Value / wsROFO.Cells(16, j).Value
        If wsROFO.Cells(17, j).Value <> 0 Then wsROFO.Cells(49, j).Value = wsROFO.Cells(35, j).Value / wsROFO.Cells(17, j).Value
        If wsROFO.Cells(19, j).Value <> 0 Then wsROFO.Cells(50, j).Value = wsROFO.Cells(36, j).Value / wsROFO.Cells(19, j).Value
        If wsROFO.Cells(20, j).Value <> 0 Then wsROFO.Cells(51, j).Value = wsROFO.Cells(37, j).Value / wsROFO.Cells(20, j).Value
        
        ' LÓGICA TM por BL (ASSUMIDA)
        ' RACIOCÍNIO: Suponho que o TM por BL seja a receita LCL dividida pelo número de BLs da mesma categoria.
        If wsROFO.Cells(22, j).Value <> 0 Then wsROFO.Cells(52, j).Value = wsROFO.Cells(36, j).Value / wsROFO.Cells(22, j).Value ' LCL H TM (R$/BL)
        If wsROFO.Cells(23, j).Value <> 0 Then wsROFO.Cells(53, j).Value = wsROFO.Cells(37, j).Value / wsROFO.Cells(23, j).Value ' LCL P TM (R$/BL)

    Next j
    
    ' --- 4. FINALIZAÇÃO ---
Cleanup:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    MsgBox "Atualização da ROFO_CNTR concluída com sucesso!", vbInformation
    Exit Sub

ErrorHandler:
    MsgBox "Ocorreu um erro: " & vbCrLf & Err.Description, vbCritical, "Erro na Execução"
    Resume Cleanup ' Garante que as configurações do Excel sejam restauradas mesmo em caso de erro

End Sub