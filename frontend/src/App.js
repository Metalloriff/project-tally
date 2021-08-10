import React from "react";
import "./App.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder } from "@fortawesome/free-solid-svg-icons";
import SwitchItem from "./Components/SwitchItem";
import languages from "./Classes/languages.json";
import InlineLoading from "./Components/InlineLoading";
import Tooltip from "./Components/Tooltip";

const electron = window.require("electron");

function selectDirectory() {
	return electron.remote.dialog.showOpenDialog(
		null,
		{ properties: ["openDirectory"] }
	);
}

const options = {
	includeSubDirs: true,
	blackList: `/node_modules/\n/build/`,
	languages: Object.keys(languages)
};

const fs = window.require("fs");
const path = window.require("path");

async function process() {
	const validExtensions = options.languages.reduce((arr, lang) => {
		for (const extension of languages[lang].extensions)
			arr.push(extension);
		return arr;
	}, []);
	const files = [];
	const blacklist = options.blackList.split("\n").map(bl => bl.replace(/\//g, "\\").trim());
	
	async function processDirectory(dir) {
		const children = await new Promise(r =>
			fs.readdir(dir, (err, files) => r(files)));
		
		for (const child of children) {
			const fp = path.join(dir, child);
			if (blacklist.some(bl => ~fp.indexOf(bl))) continue;
			const stats = fs.lstatSync(fp);
			
			if (stats.isDirectory()) {
				if (options.includeSubDirs) {
					await processDirectory(fp);
				}
			}
			else if (~validExtensions.indexOf(path.extname(child)))
				files.push(fp);
			
			App.setStatus(`${files.length} files found so far`);
		}
	}
	
	await processDirectory(App.directory);
	
	const languageData = Object.entries(languages);
	const finalizedData = {
		errors: 0,
		total: {
			fileCount: 0,
			lineCount: 0,
			charCount: 0
		}
	};
	
	for (const file of files) {
		try {
			const extension = path.extname(file);
			const filename = path.basename(file);
			const language = languageData.find(([, lang]) =>
				~lang.extensions.indexOf(extension))[0];
			const localPath = file.replace(App.directory, "").slice(1);

			App.setStatus(`Reading ${filename}...`);

			if (!finalizedData[language])
				finalizedData[language] = {
					fileCount: 0,
					lineCount: 0,
					charCount: 0,
					fileData: {}
				};
			
			const data = await new Promise(r =>
				fs.readFile(file, "utf8", 
					(err, data) => r(data)));
			
			const output = {
				lineCount: data.split("\n").length,
				charCount: data.length
			};
			
			finalizedData[language].fileData[localPath] = output;
			
			finalizedData.total.fileCount++;
			finalizedData.total.lineCount += output.lineCount;
			finalizedData.total.charCount += output.charCount;

			finalizedData[language].fileCount++;
			finalizedData[language].lineCount += output.lineCount;
			finalizedData[language].charCount += output.charCount;
		}
		catch (e) {
			finalizedData.errors++;
			
			console.error(e);
		}
	}
	
	for (const lang of options.languages) {
		if (!finalizedData[lang]) continue;
		
		finalizedData[lang].filePercentage =
			finalizedData[lang].fileCount / finalizedData.total.fileCount;
		finalizedData[lang].linePercentage =
			finalizedData[lang].lineCount / finalizedData.total.lineCount;
		finalizedData[lang].charPercentage =
			finalizedData[lang].charCount / finalizedData.total.charCount;
		
		for (const fp in finalizedData[lang].fileData) {
			finalizedData[lang].fileData[fp].linePercentage =
				finalizedData[lang].fileData[fp].lineCount / finalizedData[lang].lineCount;
			finalizedData[lang].fileData[fp].charPercentage =
				finalizedData[lang].fileData[fp].charCount / finalizedData[lang].charCount;
		}
	}
	
	App.setTallyData(finalizedData);
	App.setProcessingState(false);
	
	console.log(finalizedData);
}

function TallyDataItem({ lang, data, children = null }) {
	const [collapsed, setCollapsed] = React.useState(true);
	const filenames = React.useMemo(() => data
		? Object.keys(data.fileData).sort((x, y) =>
			data.fileData[y].charCount - data.fileData[x].charCount)
		: [], []);
	const [renderedChildren, renderChildren] = React.useState(data ? filenames.slice(0, 20) : []);
	
	return (
		<div className="TallyItem" onClick={e => e.target === e.currentTarget && setCollapsed(!collapsed)}>
			<h2 className="Title">
				<div className="ColorItem"
					 style={{ backgroundColor: languages[lang]?.color ?? "white" }}/>

				<div className="SubTitle">{lang}</div>
			</h2>

			{ !collapsed && (
				children ?? (
					<div className="Contents">
						<h1 className="Title" style={{ marginTop: 0 }}>Overall Stats</h1>

						<div className="Entry">
							<b>{lang} File Count</b> - <span>{formatNumberValue(data.fileCount)}</span>
						</div>

						<div className="Entry">
							<b>{lang} Line Count</b> - <span>{formatNumberValue(data.lineCount)}</span>
						</div>

						<div className="Entry">
							<b>{lang} Character Count</b> - <span>{formatNumberValue(data.charCount)}</span>
						</div>
						
						<h1 className="Title">Per-file Data</h1>
						
						{ renderedChildren.map(fp => (
							<div className="Entry" key={fp}>
								<div className="Big">{fp}</div>
								
								<p><b>Line Count</b> - <span>{formatNumberValue(data.fileData[fp].lineCount)}</span></p>
								<p><b>Char Count</b> - <span>{formatNumberValue(data.fileData[fp].charCount)}</span></p>
								<p><b>Line Count % of {lang}</b> - <span>{(data.fileData[fp].linePercentage * 100).toFixed(1)}%</span></p>
								<p><b>Char Count % of {lang}</b> - <span>{(data.fileData[fp].charPercentage * 100).toFixed(1)}%</span></p>
							</div>
						)) }
						
						{ filenames.length - renderedChildren.length > 0 && (
							<div className="Button" style={{ marginRight: 0, marginBottom: 0 }}
								 onClick={() => renderChildren([...renderedChildren, ...filenames.slice(renderedChildren.length, renderedChildren.length + 20)])}>
								Show More ({filenames.length - renderedChildren.length} remaining)
							</div>
						) }
					</div>
				)
			) }
		</div>
	);
}

function formatNumberValue(num) {
	return new Intl.NumberFormat().format(num);
}

function exportData(data) {
	electron.remote.dialog
		.showSaveDialog(null, { filters: [{ name: "Tally Data JSON", extensions: ["json"] }] })
		.then(({ filePath }) =>
			filePath && fs.writeFileSync(filePath, JSON.stringify(data, null, "\t"), { encoding: "utf8" }));
}

export default function App() {
	const [directory, setDirectoryState] = React.useState(null);
	const [processing, setProcessingState] = React.useState(false);
	const [tallyData, setTallyData] = React.useState(null);
	const [statusText, setStatus] = React.useState(null);
	
	const setDirectory = dir => {
		setDirectoryState(dir);
		setTallyData(null);
		setStatus(null);
	};
	
	App.directory = directory;
	App.setProcessingState = setProcessingState;
	App.setTallyData = setTallyData;
	App.setStatus = setStatus;
	
	const tallyLanguages =
		tallyData
			? options.languages.filter(lang => tallyData[lang])
			: null;
	
	return (
		<div className="App">
			<div className="Main">
				<div className="FilePickerContainer" onClick={() =>
					selectDirectory().then(({ filePaths }) => filePaths?.length && setDirectory(filePaths[0]))}>
					<FontAwesomeIcon icon={faFolder} className="Icon"/>
					
					<div className="DirectoryContainer">
						{ directory?.length ? directory : <span>No directory selected.</span> }
					</div>
					
					<div>
						Select Directory
					</div>
				</div>
				
				{ processing && (
					<div className="Processing">
						<h1>Scanning...</h1>
						{ statusText?.length && <h1>{statusText}</h1> }
						<InlineLoading/>
					</div>
				) }
				
				{ tallyData && (
					<div className="DirectoryPropertyContainer TallyDataList">
						<TallyDataItem lang="Total">
							<div className="Contents">
								<h1 className="Title" style={{ marginTop: 0 }}>Overall Stats</h1>
								
								<div className="Entry">
									<b>Total File Count</b> - <span>{formatNumberValue(tallyData.total.fileCount)}</span>
								</div>
								
								<div className="Entry">
									<b>Total Line Count</b> - <span>{formatNumberValue(tallyData.total.lineCount)}</span>
								</div>

								<div className="Entry">
									<b>Total Character Count</b> - <span>{formatNumberValue(tallyData.total.charCount)}</span>
								</div>
								
								<h1 className="Title">Language Percentages</h1>
								
								<div className="Entry">
									<div className="Title">By File Count</div>

									<div className="PercentageTally">
										{ tallyLanguages
											.sort((x, y) => tallyData[y].filePercentage - tallyData[x].filePercentage)
											.map(lang => (
											<div className="Bar" key={lang}
												 style={{
													 backgroundColor: languages[lang].color,
													 width: (tallyData[lang].filePercentage * 100) + "%"
												 }}>
												<Tooltip color="var(--primary-bg)">
													{lang} - <span style={{ color: "var(--primary-color)" }}>{(tallyData[lang].filePercentage * 100).toFixed(1)}%</span>
												</Tooltip>
											</div>
										)) }
									</div>
								</div>

								<div className="Entry">
									<div className="Title">By Line Count</div>

									<div className="PercentageTally">
										{ tallyLanguages
											.sort((x, y) => tallyData[y].linePercentage - tallyData[x].linePercentage)
											.map(lang => (
											<div className="Bar" key={lang}
												 style={{
													 backgroundColor: languages[lang].color,
													 width: (tallyData[lang].linePercentage * 100) + "%"
												 }}>
												<Tooltip color="var(--primary-bg)">
													{lang} - <span style={{ color: "var(--primary-color)" }}>{(tallyData[lang].linePercentage * 100).toFixed(1)}%</span>
												</Tooltip>
											</div>
										)) }
									</div>
								</div>

								<div className="Entry">
									<div className="Title">By Character Count</div>

									<div className="PercentageTally">
										{ tallyLanguages
											.sort((x, y) => tallyData[y].charPercentage - tallyData[x].charPercentage)
											.map(lang => tallyData[lang] && (
											<div className="Bar" key={lang}
												 style={{
													 backgroundColor: languages[lang].color,
													 width: (tallyData[lang].charPercentage * 100) + "%"
												 }}>
												<Tooltip color="var(--primary-bg)">
													{lang} - <span style={{ color: "var(--primary-color)" }}>{(tallyData[lang].charPercentage * 100).toFixed(1)}%</span>
												</Tooltip>
											</div>
										)) }
									</div>
								</div>
							</div>
						</TallyDataItem>
						
						{ tallyLanguages.sort((x, y) => tallyData[y].charPercentage - tallyData[x].charPercentage).map(lang =>
							<TallyDataItem key={lang} data={tallyData[lang]} lang={lang}/>) }
					</div>
				) }
				
				{ directory?.length && !processing && !tallyData && (
					<React.Fragment>
						<div className="DirectoryPropertyContainer">
							<SwitchItem title="Include sub-directories" defaultValue={options.includeSubDirs}
										callback={val => (options.includeSubDirs = val)}/>
						</div>
						
						<div className="DirectoryPropertyContainer">
							<div className="BlacklistContainer">
								<h2 className="Title">Blacklist</h2>
								
								<p className="Note">
									Files and directories containing keywords from your blacklist 
									will not be included in the search.
								</p>
								<p className="Note">
									Separate with new lines.
								</p>
								
								<textarea className="Field" defaultValue={options.blackList} spellCheck={false}
										  onChange={e => (options.blackList = e.currentTarget.value)}/>
							</div>
						</div>
						
						<div className="DirectoryPropertyContainer">
							<div className="LanguagesList">
								<h2 className="Title">Languages</h2>

								<p className="Note">
									What languages you wish to include in the search.
								</p>
								
								<div className="List">
									{ Object.entries(languages).map(([languageName, data]) => (
										<SwitchItem title={(
											<span>
												<span className="ColorItem" style={{ backgroundColor: data.color }}/>
												<span className="SubTitle">{languageName}</span>
											</span>
										)} defaultValue={true} key={languageName} callback={val =>
											!val
												? options.languages.splice(options.languages.indexOf(languageName), 1)
												: options.languages.push(languageName)}/>
									)) }
								</div>
							</div>
						</div>
					</React.Fragment>
				) }

				<div className="Buttons">
					{ directory?.length && !processing && (
						<div className="Button" onClick={() =>
							(console.log(options), setProcessingState(true), process())}>
							{ tallyData ? "Re-tally" : "Begin Scan" }
						</div>
					) }

					{ tallyData && (
						<div className="Button" onClick={exportData.bind(null, tallyData)}>
							Export Data To JSON
						</div>
					) }
				</div>
			</div>

			<footer className="Footer">
				<div><a href="https://fontawesome.com/license">Icon License</a></div>
				<div className="Divider"/>
				<div><a href="https://www.nordtheme.com">Color Palette</a></div>
				<div className="Divider"/>
				<div>Copyright © 2021-{new Date().getFullYear()} Metalloriff</div>
				<div className="Divider"/>
				<div>Made by <a href="https://metalloriff.github.io/">Metalloriff</a></div>
			</footer>
		</div>
	);
}