' Força a declaração explícita de todas as variáveis, uma boa prática essencial.
Option Explicit

' =========================================================================================
' MACRO PRINCIPAL - Orquestra todo o processo de atualização do Forecast.
' =========================================================================================
Sub AtualizarForecastTEV()
    Dim wsInfos As Worksheet
    Dim wsFcst As Worksheet
    Dim mapa As Object ' Dicionário para o mapeamento
    
    ' --- 1. CONFIGURAÇÃO INICIAL ---
    On Error Resume Next
    Set wsInfos = ThisWorkbook.Worksheets("INFOS TEV")
    Set wsFcst = ThisWorkbook.Worksheets("FORECAST TEV")
    On Error GoTo 0
    
    If wsInfos Is Nothing Or wsFcst Is Nothing Then
        MsgBox "Planilhas 'infos' e/ou 'forecast' não encontradas. Verifique os nomes.", vbCritical
        Exit Sub
    End If
    
    ' Desativa processos do Excel para máxima performance
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False
    
    ' --- 2. EXECUÇÃO DO PROCESSO ---
    ' Passo 1: Cria o dicionário com o mapeamento "De-Para".
    Set mapa = CriarMapaDePara()
    
    ' Passo 2: Preenche os dados primários que vêm diretamente da planilha 'infos'.
    Call PreencherDadosDiretos(wsInfos, wsFcst, mapa)
    
    ' Passo 3: Com os dados primários no lugar, calcula todas as linhas de totais, TMs e Mixes.
    Call CalcularAgregadosETMs(wsFcst)
    
    ' --- 3. FINALIZAÇÃO ---
    ' Reativa os processos do Excel
    Application.EnableEvents = True
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    
    MsgBox "Forecast TEV atualizado com sucesso!", vbInformation, "Processo Concluído"
End Sub

' =========================================================================================
' FUNÇÃO DE MAPEAMENTO - Define a relação entre 'infos' e 'forecast'.
' =========================================================================================
Private Function CriarMapaDePara() As Object
    Set CriarMapaDePara = CreateObject("Scripting.Dictionary")
    
    ' A chave do dicionário é uma string composta: "NOME_DO_BLOCO|NOME_DA_CATEGORIA_INFOS"
    ' Isso permite que a rotina de preenchimento saiba em qual seção procurar.
    
    ' Mapeamento Bloco 1.A - EXPORTAÇÃO
    CriarMapaDePara.Add "BLOCO 1.A - EXPORTAÇÃO|expo_leve_mes", "Receita leve (R$ mil)"
    CriarMapaDePara.Add "BLOCO 1.A - EXPORTAÇÃO|expo_pesado_mes", "Receita pesado (R$ mil)"
    CriarMapaDePara.Add "BLOCO 1.A - EXPORTAÇÃO|expo_leve_veic", "# Veículos leve (unid)"
    CriarMapaDePara.Add "BLOCO 1.A - EXPORTAÇÃO|expo_pesado_veic", "# Veículos pesado (unid)"
    
    ' Mapeamento Bloco 1.B - IMPORTAÇÃO
    CriarMapaDePara.Add "BLOCO 1.B - IMPORTAÇÃO|import_leve_mes", "Receita leve (R$ mil)"
    CriarMapaDePara.Add "BLOCO 1.B - IMPORTAÇÃO|import_pesado_mes", "Receita pesado (R$ mil)"
    CriarMapaDePara.Add "BLOCO 1.B - IMPORTAÇÃO|import_leve_veic", "# Veículos leve (unid)"
    CriarMapaDePara.Add "BLOCO 1.B - IMPORTAÇÃO|import_pesado_veic", "# Veículos pesado (unid)"

    ' Mapeamento Bloco 1 (MOV. VEÍCULOS)
    CriarMapaDePara.Add "BLOCO 1 (MOV. VEÍCULOS)|total_veic", "# Veículos (unid)"
    
    ' Mapeamento Bloco 2 - CARGA SOLTA
    CriarMapaDePara.Add "BLOCO 2 (CARGA SOLTA)|carga_solta_mes", "Receita (R$ mil)"
    
    ' Mapeamento Bloco 3 - Outros
    CriarMapaDePara.Add "BLOCO 3 (Outros)|outros_mes", "Receita Demais serviços (R$ mil)"
    CriarMapaDePara.Add "BLOCO 3 (Outros)|inspe_mes", "Receita Inspeção (R$ mil)"

    ' Mapeamento Bloco 4 - Operação de Cais
    CriarMapaDePara.Add "BLOCO 4 (Operação de Cais)|oper_cais_mes", "Receita Operação de Cais (R$ mil)"
    
    ' Mapeamento Bloco 5 - Carga Geral
    CriarMapaDePara.Add "BLOCO 5 (Carga Geral)|carga_geral_mes", "Receita Carga Geral (R$ mil)"
End Function

' =========================================================================================
' SUB-ROTINA - Preenche os valores diretos da 'infos' na 'forecast'.
' =========================================================================================
Private Sub PreencherDadosDiretos(ByVal wsInfos As Worksheet, ByVal wsFcst As Worksheet, ByVal mapa As Object)
    Dim lastColInfos As Long, lastRowInfos As Long, colInfos As Long, linInfos As Long, colFcst As Long
    Dim dataColuna As Date, ano As Integer, mes As Integer
    Dim categoriaInfos As String, valor As Double, descricaoFcst As String
    Dim chaveMapa As Variant, secaoBloco As String
    
    lastColInfos = wsInfos.Cells(1, wsInfos.Columns.Count).End(xlToLeft).Column
    lastRowInfos = wsInfos.Cells(wsInfos.Rows.Count, "A").End(xlUp).Row
    
    For colInfos = 2 To lastColInfos
        ' Verificar se a célula contém uma data válida
        On Error Resume Next
        dataColuna = wsInfos.Cells(1, colInfos).Value
        On Error GoTo 0
        
        If IsDate(dataColuna) Then
            ano = Year(dataColuna)
            mes = Month(dataColuna)
            
            colFcst = EncontrarColunaFcst(wsFcst, ano, mes)
            
            If colFcst > 0 Then
                For linInfos = 2 To lastRowInfos
                    categoriaInfos = Trim(CStr(wsInfos.Cells(linInfos, "A").Value))
                    
                    ' Pular linhas vazias
                    If categoriaInfos <> "" Then
                        For Each chaveMapa In mapa.Keys
                            If Split(chaveMapa, "|")(1) = categoriaInfos Then
                                secaoBloco = Split(chaveMapa, "|")(0)
                                descricaoFcst = mapa(chaveMapa)
                                valor = wsInfos.Cells(linInfos, colInfos).Value
                                
                                Dim linhaDestino As Long
                                linhaDestino = FindRowInSection(wsFcst, secaoBloco, descricaoFcst)
                                If linhaDestino > 0 Then
                                    wsFcst.Cells(linhaDestino, colFcst).Value = valor
                                End If
                                Exit For
                            End If
                        Next chaveMapa
                    End If
                Next linInfos
            End If
        End If
    Next colInfos
End Sub

' =========================================================================================
' SUB-ROTINA - CALCULA TODAS AS LINHAS DE TOTAIS, MÉDIAS E PERCENTUAIS (VERSÃO CORRIGIDA)
' =========================================================================================
Private Sub CalcularAgregadosETMs(ByVal wsFcst As Worksheet)
    Dim lastColFcst As Long, c As Long
    
    lastColFcst = wsFcst.Cells(1, wsFcst.Columns.Count).End(xlToLeft).Column
    
    ' --- Define as strings dos blocos e itens para evitar erros de digitação ---
    Const SEC_EXPO As String = "BLOCO 1.A - EXPORTAÇÃO"
    Const SEC_IMPO As String = "BLOCO 1.B - IMPORTAÇÃO"
    Const SEC_MOV_VEIC As String = "BLOCO 1 (MOV. VEÍCULOS)"
    Const SEC_CARGA_SOLTA As String = "BLOCO 2 (CARGA SOLTA)"
    Const SEC_OUTROS As String = "BLOCO 3 (Outros)"
    Const SEC_OP_CAIS As String = "BLOCO 4 (Operação de Cais)"
    Const SEC_CARGA_GERAL As String = "BLOCO 5 (Carga Geral)"

    Const ITEM_REC_LEVE As String = "Receita leve (R$ mil)"
    Const ITEM_REC_PESADO As String = "Receita pesado (R$ mil)"
    Const ITEM_VEIC_LEVE As String = "# Veículos leve (unid)"
    Const ITEM_VEIC_PESADO As String = "# Veículos pesado (unid)"
    Const ITEM_REC_TOTAL As String = "Receita Exportação (R$ mil)"
    Const ITEM_VEIC_TOTAL As String = "# Veículos Exportação (unid)"
    Const ITEM_TM_TOTAL As String = "TM Exportação (R$/veíc.)"
    Const ITEM_TM_LEVE As String = "TM leve (R$/veíc.)"
    Const ITEM_TM_PESADO As String = "TM pesado (R$/veíc.)"
    
    ' Loop em cada coluna de mês na 'forecast' para realizar os cálculos
    For c = 3 To lastColFcst
        ' --- Variáveis para armazenar valores da coluna atual ---
        Dim rExpoLeve, rExpoPesado, vExpoLeve, vExpoPesado As Double
        Dim rImpoLeve, rImpoPesado, vImpoLeve, vImpoPesado As Double
        Dim rCargaSolta, rOutrosDemais, rOutrosInspecao As Double
        Dim rOpCais, rCargaGeral As Double
        
        ' Variável para a linha de destino, usada para programação defensiva
        Dim linhaDestino As Long

        ' --- 1. COLETA DE DADOS PRIMÁRIOS DA COLUNA ---
        rExpoLeve = wsFcst.Cells(FindRowInSection(wsFcst, SEC_EXPO, ITEM_REC_LEVE), c).Value
        rExpoPesado = wsFcst.Cells(FindRowInSection(wsFcst, SEC_EXPO, ITEM_REC_PESADO), c).Value
        vExpoLeve = wsFcst.Cells(FindRowInSection(wsFcst, SEC_EXPO, ITEM_VEIC_LEVE), c).Value
        vExpoPesado = wsFcst.Cells(FindRowInSection(wsFcst, SEC_EXPO, ITEM_VEIC_PESADO), c).Value
        
        rImpoLeve = wsFcst.Cells(FindRowInSection(wsFcst, SEC_IMPO, ITEM_REC_LEVE), c).Value
        rImpoPesado = wsFcst.Cells(FindRowInSection(wsFcst, SEC_IMPO, ITEM_REC_PESADO), c).Value
        vImpoLeve = wsFcst.Cells(FindRowInSection(wsFcst, SEC_IMPO, ITEM_VEIC_LEVE), c).Value
        vImpoPesado = wsFcst.Cells(FindRowInSection(wsFcst, SEC_IMPO, ITEM_VEIC_PESADO), c).Value
        
        rCargaSolta = wsFcst.Cells(FindRowInSection(wsFcst, SEC_CARGA_SOLTA, "Receita (R$ mil)"), c).Value
        rOutrosDemais = wsFcst.Cells(FindRowInSection(wsFcst, SEC_OUTROS, "Receita Demais serviços (R$ mil)"), c).Value
        rOutrosInspecao = wsFcst.Cells(FindRowInSection(wsFcst, SEC_OUTROS, "Receita Inspeção (R$ mil)"), c).Value
        rOpCais = wsFcst.Cells(FindRowInSection(wsFcst, SEC_OP_CAIS, "Receita Operação de Cais (R$ mil)"), c).Value
        rCargaGeral = wsFcst.Cells(FindRowInSection(wsFcst, SEC_CARGA_GERAL, "Receita Carga Geral (R$ mil)"), c).Value

        ' --- 2. CÁLCULOS E PREENCHIMENTO POR BLOCO ---
        ' --- BLOCO 1.A - EXPORTAÇÃO ---
        Dim rTotalExpo, vTotalExpo As Double
        rTotalExpo = rExpoLeve + rExpoPesado
        vTotalExpo = vExpoLeve + vExpoPesado
        
        linhaDestino = FindRowInSection(wsFcst, SEC_EXPO, ITEM_REC_TOTAL)
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = rTotalExpo
        
        linhaDestino = FindRowInSection(wsFcst, SEC_EXPO, ITEM_VEIC_TOTAL)
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = vTotalExpo
        
        linhaDestino = FindRowInSection(wsFcst, SEC_EXPO, ITEM_TM_TOTAL)
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rTotalExpo, vTotalExpo)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_EXPO, ITEM_TM_LEVE)
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rExpoLeve, vExpoLeve)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_EXPO, ITEM_TM_PESADO)
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rExpoPesado, vExpoPesado)
        
        ' --- BLOCO 1.B - IMPORTAÇÃO ---
        Dim rTotalImpo, vTotalImpo As Double
        rTotalImpo = rImpoLeve + rImpoPesado
        vTotalImpo = vImpoLeve + vImpoPesado

        linhaDestino = FindRowInSection(wsFcst, SEC_IMPO, Replace(ITEM_REC_TOTAL, "Exportação", "Importação"))
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = rTotalImpo
        
        linhaDestino = FindRowInSection(wsFcst, SEC_IMPO, Replace(ITEM_VEIC_TOTAL, "Exportação", "Importação"))
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = vTotalImpo
        
        linhaDestino = FindRowInSection(wsFcst, SEC_IMPO, Replace(ITEM_TM_TOTAL, "Exportação", "Importação"))
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rTotalImpo, vTotalImpo)
        
        ' TM Leve e Pesado para Importação (adicionado)
        linhaDestino = FindRowInSection(wsFcst, SEC_IMPO, ITEM_TM_LEVE)
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rImpoLeve, vImpoLeve)

        linhaDestino = FindRowInSection(wsFcst, SEC_IMPO, ITEM_TM_PESADO)
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rImpoPesado, vImpoPesado)

        ' --- BLOCO 1 (MOV. VEÍCULOS) ---
        Dim rTotalMovVeic, vTotalMovVeic As Double
        rTotalMovVeic = rTotalExpo + rTotalImpo
        vTotalMovVeic = vTotalExpo + vTotalImpo
        
        ' O valor do total de veículos que será o denominador para os TMs dos outros blocos é calculado aqui.
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "Receita (R$ mil)")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = rTotalMovVeic
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "# Veículos (unid)")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = vTotalMovVeic
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "TM (R$/veíc.)")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rTotalMovVeic, vTotalMovVeic)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "TM (R$/veíc.) - contribuição Expo leve")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rExpoLeve, vExpoLeve)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "TM (R$/veíc.) - contribuição Expo pesado")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rExpoPesado, vExpoPesado)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "TM (R$/veíc.) - contribuição Impo leve")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rImpoLeve, vImpoLeve)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "TM (R$/veíc.) - contribuição Impo pesado")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rImpoPesado, vImpoPesado)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "Mix Expo leve")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(vExpoLeve, vTotalMovVeic)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "Mix Expo pesado")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(vExpoPesado, vTotalMovVeic)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "Mix Impo leve")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(vImpoLeve, vTotalMovVeic)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_MOV_VEIC, "Mix Impo pesado")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(vImpoPesado, vTotalMovVeic)

        ' --- BLOCO 2 (CARGA SOLTA) ---
        linhaDestino = FindRowInSection(wsFcst, SEC_CARGA_SOLTA, "TM (R$/veíc.) - contribuição CARGA SOLTA")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rCargaSolta, vTotalMovVeic)
        
        ' --- BLOCO 3 (Outros) ---
        linhaDestino = FindRowInSection(wsFcst, SEC_OUTROS, "TM (R$/veíc.) - contribuição Inspeção")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rOutrosInspecao, vTotalMovVeic)
        
        linhaDestino = FindRowInSection(wsFcst, SEC_OUTROS, "TM (R$/veíc.) - contribuição Demais serviços")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rOutrosDemais, vTotalMovVeic)

        ' --- BLOCO 4 (Operação de Cais) ---
        linhaDestino = FindRowInSection(wsFcst, SEC_OP_CAIS, "TM (R$/veíc.) - contribuição")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rOpCais, vTotalMovVeic)
        
        ' --- BLOCO 5 (Carga Geral) ---
        linhaDestino = FindRowInSection(wsFcst, SEC_CARGA_GERAL, "TM (R$/veíc.) - contribuição")
        If linhaDestino > 0 Then wsFcst.Cells(linhaDestino, c).Value = SafeDivide(rCargaGeral, vTotalMovVeic)
        
    Next c
End Sub

' =========================================================================================
' FUNÇÕES AUXILIARES - Ferramentas reutilizáveis para o código principal.
' =========================================================================================

' --- Função de Busca Contextual: Encontra um texto dentro de uma seção específica (VERSÃO CORRIGIDA) ---
Private Function FindRowInSection(ByVal ws As Worksheet, ByVal sectionHeader As String, ByVal itemToFind As String) As Long
    Dim sectionRange As Range, itemRange As Range, nextSection As Range
    Dim startRow As Long, endRow As Long
    
    ' Encontra o início da seção (agora insensível a maiúsculas/minúsculas)
    Set sectionRange = ws.Columns("B").Find(What:=sectionHeader, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)
    
    If sectionRange Is Nothing Then
        FindRowInSection = 0
        Exit Function
    End If
    startRow = sectionRange.Row
    
    ' Procura o início do próximo bloco para delimitar o fim da seção atual
    Set nextSection = ws.Range("B" & (startRow + 1) & ":B" & ws.Rows.Count).Find(What:="BLOCO", LookIn:=xlValues, LookAt:=xlPart, MatchCase:=False)
    
    If nextSection Is Nothing Then
        ' Se não encontrar um próximo bloco, assume que a seção vai até a última linha preenchida
        endRow = ws.Cells(ws.Rows.Count, "B").End(xlUp).Row
    Else
        ' O fim da seção é a linha anterior ao início da próxima
        endRow = nextSection.Row - 1
    End If
    
    ' Garante que o range de busca é válido
    If endRow >= startRow Then
        ' Agora busca o item apenas dentro do intervalo determinado da seção
        Set itemRange = ws.Range("B" & startRow & ":B" & endRow).Find(What:=itemToFind, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)
        
        If Not itemRange Is Nothing Then
            FindRowInSection = itemRange.Row
        Else
            FindRowInSection = 0 ' Retorna 0 se o item não for encontrado na seção
        End If
    Else
        FindRowInSection = 0 ' Retorna 0 se o range da seção for inválido
    End If
End Function

' --- Função de Busca de Coluna: Encontra a coluna pelo Ano e Mês ---
Private Function EncontrarColunaFcst(ByVal ws As Worksheet, ByVal ano As Integer, ByVal mes As Integer) As Long
    Dim lastCol As Long, c As Long
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    EncontrarColunaFcst = 0
    
    For c = 3 To lastCol
        If Not IsEmpty(ws.Cells(1, c).Value) And Not IsEmpty(ws.Cells(2, c).Value) Then
            ' Verificar se a célula está merged antes de acessar MergeArea
            Dim anoValue As Variant
            If ws.Cells(1, c).MergeCells Then
                anoValue = ws.Cells(1, c).MergeArea.Cells(1, 1).Value
            Else
                anoValue = ws.Cells(1, c).Value
            End If
            
            If anoValue = ano And ws.Cells(2, c).Value = mes Then
                EncontrarColunaFcst = c
                Exit Function
            End If
        End If
    Next c
End Function

' --- Função de Divisão Segura: Evita erros de divisão por zero ---
Private Function SafeDivide(ByVal Numerator As Double, ByVal Denominator As Double) As Double
    If Denominator = 0 Then
        SafeDivide = 0
    Else
        SafeDivide = Numerator / Denominator
    End If
End Function